"""Loopback-only BGM bridge. Only the configured workshop may access authenticated routes."""
import os, html
import json, secrets, threading, time, uuid, shutil, subprocess, sys, urllib.request
import math
from urllib.parse import urlsplit, parse_qs
from bgm_reference import MAX_DURATION, MAX_UPLOAD, ingest_upload, list_uploads, resolve_reference, prepare_reference, apply_reference
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
ROOT = Path(__file__).resolve().parent / 'runtime'
ROOT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(Path(__file__).resolve().parent / 'local_bgm'))
from generate_samples import graph, api
ORIGIN = os.environ.get('WORKSHOP_ORIGIN', 'http://127.0.0.1:4173').rstrip('/')
parsed_origin = urlsplit(ORIGIN)
if parsed_origin.scheme not in {'http', 'https'} or not parsed_origin.netloc or parsed_origin.path or parsed_origin.query or parsed_origin.fragment or parsed_origin.username:
    raise ValueError('WORKSHOP_ORIGIN must be a plain http(s) origin')
ALLOWED = {ORIGIN, 'http://127.0.0.1:4173'}
DATA = ROOT / 'library'
DATA.mkdir(exist_ok=True)
UPLOADS = ROOT / 'reference_audio'
UPLOADS.mkdir(exist_ok=True)
KEY = ROOT / '.bridge_key'
if not KEY.exists(): KEY.write_text(secrets.token_urlsafe(32), encoding='utf-8')
TOKEN = KEY.read_text(encoding='utf-8').strip()
pool = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()

def engine_ready():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8188/system_stats', timeout=2) as response:
            data = json.load(response)
        return isinstance(data, dict) and 'system' in data and 'devices' in data
    except (OSError, ValueError):
        return False

def read_job(i):
    return json.loads((DATA / i / 'metadata.json').read_text(encoding='utf-8'))

def save(j):
    d=DATA/j['id']; d.mkdir(exist_ok=True)
    temp=d/'metadata.tmp'; temp.write_text(json.dumps(j,ensure_ascii=False),encoding='utf-8'); temp.replace(d/'metadata.json')

def generate(j):
    reference_input = None
    try:
        j['status']='generating'; save(j)
        workflow=graph({'model':'stable_audio_3_small_music.safetensors','duration_seconds':j['duration'],'steps':8}, {'id':j['id'],'prompt':j['prompt']+' Purely instrumental, no vocals. BPM: '+str(j['bpm'])+'. Length: '+str(j['duration'])+' seconds.','seed':j['seed']})
        if j.get('reference'):
            source, _ = resolve_reference(DATA, UPLOADS, j['reference'])
            audio_name = 'workshop_reference_' + j['id'] + '.wav'
            reference_input = ROOT / 'ComfyUI/input' / audio_name
            prepare_reference(source, reference_input, j['duration'])
            workflow = apply_reference(workflow, audio_name, j['strength'], j['duration'])
        (DATA/j['id']/'workflow.json').write_text(json.dumps(workflow),encoding='utf-8')
        if not j.get('promptId'): j['promptId']=api('/prompt',{'prompt':workflow})['prompt_id']; save(j)
        start=time.monotonic()
        while time.monotonic()-start<1200:
            h=api('/history/'+j['promptId']).get(j['promptId'])
            if h:
                if h['status'].get('status_str')=='error': raise RuntimeError('ComfyUI 생성 실패. ComfyUI 로그를 확인해 주세요.')
                a=h.get('outputs',{}).get('8',{}).get('audio',[])
                if a: break
            time.sleep(2)
        else: raise RuntimeError('생성 시간이 초과되었습니다. ComfyUI 기록을 확인해 주세요.')
        src=(ROOT/'ComfyUI/output'/a[0].get('subfolder','')/a[0]['filename']).resolve()
        if not src.is_relative_to((ROOT/'ComfyUI/output').resolve()): raise RuntimeError('잘못된 출력 경로')
        shutil.copy2(src, DATA/j['id']/'original.flac')
        for ext,codec in [('wav',['-c:a','pcm_s16le']),('mp3',['-c:a','libmp3lame','-q:a','2'])]:
            subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(src),'-t',str(j['duration']),'-af','loudnorm=I=-18:TP=-1.5:LRA=11','-ar','44100',*codec,str(DATA/j['id']/('audio.'+ext))],check=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=120)
        j['status']='saved'; j['elapsed']=round(time.monotonic()-start,1); save(j)
    except Exception as e:
        j['status']='error'; j['error']=str(e)[:400]; save(j)
    finally:
        # Keep queued/running Comfy inputs available after timeout for diagnosis/recovery.
        if reference_input and j['status']=='saved': reference_input.unlink(missing_ok=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,status,data,kind='application/json'):
        body=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('X-Frame-Options','DENY')
        origin=self.headers.get('Origin','')
        if origin in ALLOWED:
            self.send_header('Access-Control-Allow-Origin',origin); self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type'); self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS'); self.send_header('Access-Control-Allow-Private-Network','true')
        self.end_headers(); self.wfile.write(body)
    def guard(self,auth=True):
        if self.headers.get('Host')!='127.0.0.1:8190' or (self.headers.get('Origin') and self.headers['Origin'] not in ALLOWED): self.send(403,{'error':'허용되지 않은 접근'}); return False
        if auth and not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN): self.send(401,{'error':'PC 연결을 먼저 해주세요.'}); return False
        return True
    def do_OPTIONS(self):
        if self.guard(False): self.send(200,{})
    def do_GET(self):
        if self.path=='/health':
            if not self.guard(False): return
            return self.send(200,{'application':'dusk-bgm-bridge','edition':'public','workshopOrigin':ORIGIN,'version':2,'engineReady':engine_ready()})
        if self.path=='/pair':
            if not self.guard(False): return
            pair_html='<meta charset="utf-8"><title>BGM PC 연결</title><body style="background:#121719;color:#eee;font:18px sans-serif;padding:50px"><h1>내 PC의 BGM 공방 연결</h1><p>이 PC에서 생성한 음악을 공방에서 듣고 저장합니다.</p><a style="color:#c9f58a" href="'+html.escape(ORIGIN, quote=True)+'/bgm/#key='+TOKEN+'">공방에 연결하고 돌아가기 →</a><p>PC와 연결 프로그램이 켜져 있어야 합니다.</p></body>'
            return self.send(200,pair_html.encode(),'text/html; charset=utf-8')
        if not self.guard(): return
        if self.path=='/status':
            return self.send(200,{'online':True,'engineReady':engine_ready(),'libraryPath':str(DATA.resolve()),'maxDuration':MAX_DURATION,'referenceAudio':True,'version':2})
        if self.path=='/library':
            return self.send(200,{'items':sorted([read_job(p.name) for p in DATA.iterdir() if (p/'metadata.json').exists()],key=lambda j:j['createdAt'],reverse=True)})
        if self.path=='/references': return self.send(200,{'items':list_uploads(UPLOADS)})
        parts=self.path.strip('/').split('/')
        if len(parts)==3 and parts[0]=='files' and len(parts[1])==32 and all(c in '0123456789abcdef' for c in parts[1]) and parts[2] in ['audio.mp3','audio.wav','original.flac','workflow.json','metadata.json']:
            p=DATA/parts[1]/parts[2]
            if p.is_file(): return self.send(200,p.read_bytes(),{'mp3':'audio/mpeg','wav':'audio/wav','flac':'audio/flac','json':'application/json'}[p.suffix[1:]])
        self.send(404,{'error':'파일이 없습니다.'})
    def do_POST(self):
        if not self.guard(): return
        route=urlsplit(self.path)
        if route.path=='/references':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=MAX_UPLOAD: raise ValueError('음원은 최대 50MB까지 업로드할 수 있습니다.')
                name=parse_qs(route.query).get('name',[''])[0]
                self.connection.settimeout(120)
                item=ingest_upload(UPLOADS,self.rfile,n,name)
                return self.send(201,item)
            except (ValueError,TypeError) as e: return self.send(400,{'error':str(e)})
            except (OSError,subprocess.SubprocessError): return self.send(500,{'error':'음원 업로드에 실패했습니다. 파일과 저장 공간을 확인해 주세요.'})
        parts=self.path.strip('/').split('/')
        if len(parts)==3 and parts[0]=='library' and parts[2]=='title':
            return self.rename_title(parts[1])
        if self.path!='/generate': return self.send(404,{})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=12000: raise ValueError('입력 크기 제한 초과')
            x=json.loads(self.rfile.read(n))
            if not isinstance(x,dict): raise ValueError('입력 형식이 올바르지 않습니다.')
            prompt=str(x.get('prompt','')).strip()
            duration=int(x.get('duration',30)); bpm=int(x.get('bpm',100))
            if not 3<=len(prompt)<=2000 or not 10<=duration<=MAX_DURATION or not 40<=bpm<=200: raise ValueError('프롬프트 3~2000자, 길이 10~120초, BPM 40~200을 입력하세요.')
            reference=None
            if x.get('reference') is not None:
                _,reference=resolve_reference(DATA,UPLOADS,x['reference'])
                strength=float(x.get('strength',0.45))
                if not math.isfinite(strength) or not 0.1<=strength<=0.9: raise ValueError('변형 정도는 10~90 사이로 선택해 주세요.')
            with lock:
                if sum(read_job(p.name)['status'] in ['queued','generating'] for p in DATA.iterdir() if (p/'metadata.json').exists())>=4: return self.send(429,{'error':'대기 중인 곡이 많습니다. 완료 후 다시 요청하세요.'})
                j={'id':uuid.uuid4().hex,'title':str(x.get('title','새 BGM'))[:80] or '새 BGM','prompt':prompt,'duration':duration,'bpm':bpm,'seed':secrets.randbelow(2**32),'status':'queued','createdAt':int(time.time()*1000)}; save(j)
                if reference:
                    j.update(reference=reference,strength=strength)
                    save(j)
            pool.submit(generate,j); self.send(202,j)
        except (ValueError,TypeError) as e: self.send(400,{'error':str(e)})

    def rename_title(self, job_id):
        if len(job_id)!=32 or any(c not in '0123456789abcdef' for c in job_id):
            return self.send(404,{'error':'음악을 찾을 수 없습니다.'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=2000: raise ValueError('입력 크기 제한 초과')
            x=json.loads(self.rfile.read(n))
            title=x.get('title') if isinstance(x,dict) else None
            if not isinstance(title,str): raise ValueError('제목을 입력해 주세요.')
            title=title.strip()
            if not 1<=len(title)<=80 or any(ord(c)<32 for c in title):
                raise ValueError('제목은 줄바꿈 없이 1~80자로 입력해 주세요.')
            with lock:
                j=read_job(job_id)
                if j['status']!='saved': return self.send(409,{'error':'음악 생성이 완료된 후 제목을 수정할 수 있습니다.'})
                j['title']=title
                save(j)
            return self.send(200,j)
        except FileNotFoundError:
            return self.send(404,{'error':'음악을 찾을 수 없습니다.'})
        except (ValueError,TypeError) as e:
            return self.send(400,{'error':str(e)})
        except OSError:
            return self.send(500,{'error':'제목을 저장하지 못했습니다. 파일 권한과 디스크 공간을 확인해 주세요.'})

if __name__=='__main__':
    for p in DATA.iterdir():
        if (p/'metadata.json').exists():
            j=read_job(p.name)
            if j['status'] in ['queued','generating']: pool.submit(generate,j)
    print('BGM bridge ready on 127.0.0.1:8190',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8190),Handler).serve_forever()
