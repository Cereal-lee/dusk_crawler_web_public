"""Exercise title persistence through HTTP without touching the real library."""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import io
import wave
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / 'bgm'))
from bgm_reference import ingest_upload, resolve_reference, apply_reference, audio_duration, prepare_reference

spec = importlib.util.spec_from_file_location('bgm_bridge', Path(__file__).parents[1] / 'bgm' / 'bgm_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class RenameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.original_data, cls.original_token, cls.original_uploads = bridge.DATA, bridge.TOKEN, bridge.UPLOADS
        bridge.DATA, bridge.TOKEN = Path(cls.temp.name), 'test-only-token'
        bridge.UPLOADS = Path(cls.temp.name) / 'uploads'
        bridge.UPLOADS.mkdir()
        cls.server = bridge.ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        bridge.DATA, bridge.TOKEN, bridge.UPLOADS = cls.original_data, cls.original_token, cls.original_uploads
        cls.temp.cleanup()

    def setUp(self):
        self.job = dict(id='a'*32, title='새 BGM', status='saved', createdAt=1,
                        prompt='Original prompt', duration=60, bpm=96, seed=42)
        bridge.save(self.job)
        (bridge.DATA / self.job['id'] / 'audio.wav').write_bytes(b'unchanged audio')

    def request(self, title, job_id=None, token='test-only-token', origin=bridge.ORIGIN):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        body = json.dumps({'title': title})
        connection.request('POST', '/library/' + (job_id or self.job['id']) + '/title', body,
                           {'Host': '127.0.0.1:8190', 'Origin': origin,
                            'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
        response = connection.getresponse()
        status, data = response.status, json.loads(response.read())
        connection.close()
        return status, data

    def test_persist_title_and_preserve_audio_and_generation_metadata(self):
        status, updated = self.request('  달빛 학원 · 타이틀  ')
        self.assertEqual(status, 200)
        expected = dict(self.job, title='달빛 학원 · 타이틀')
        self.assertEqual(updated, expected)
        self.assertEqual(bridge.read_job(self.job['id']), expected)
        self.assertEqual((bridge.DATA / self.job['id'] / 'audio.wav').read_bytes(), b'unchanged audio')

    def test_invalid_titles_do_not_change_saved_record(self):
        for title in ['', '  ', 'x'*81, 'a\nb', None, 4]:
            with self.subTest(title=title):
                self.assertEqual(self.request(title)[0], 400)
                self.assertEqual(bridge.read_job(self.job['id']), self.job)

    def test_missing_and_invalid_ids(self):
        for job_id in ['b'*32, '..', 'not-an-id']:
            self.assertEqual(self.request('new title', job_id)[0], 404)

    def test_generation_cannot_race_with_rename(self):
        self.job['status'] = 'generating'
        bridge.save(self.job)
        self.assertEqual(self.request('new title')[0], 409)
        self.assertEqual(bridge.read_job(self.job['id']), self.job)

    def test_auth_and_origin_are_required(self):
        self.assertEqual(self.request('new title', token='wrong')[0], 401)
        self.assertEqual(self.request('new title', origin='https://example.test')[0], 403)

    def test_generate_reference_and_120_seconds(self):
        payload = {'title':'variation', 'prompt':'warm piano', 'duration':120, 'bpm':100,
                   'reference':{'type':'library','id':self.job['id']}, 'strength':0.45}
        def submit(body):
            connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
            connection.request('POST', '/generate', json.dumps(body),
                               {'Host':'127.0.0.1:8190','Authorization':'Bearer test-only-token','Origin':bridge.ORIGIN})
            response=connection.getresponse(); result=(response.status,json.loads(response.read())); connection.close()
            return result
        with patch.object(bridge.pool, 'submit') as generate:
            status, job=submit(payload)
            self.assertEqual(status,202)
            self.assertNotEqual(job['id'],self.job['id'])
            self.assertEqual(job['reference']['title'],'새 BGM')
            self.assertEqual(job['strength'],0.45)
            self.assertEqual(job['duration'],120)
            generate.assert_called_once()
            for changes in [{'duration':121},{'strength':1},{'strength':float('nan')},
                            {'reference':{'type':'library','id':'../bad'}}]:
                self.assertEqual(submit(dict(payload,**changes))[0],400)

    def test_upload_decode_limit_repeat_and_workflow(self):
        raw=io.BytesIO()
        with wave.open(raw,'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000)
            audio.writeframes(b'\x00\x00'*16000)
        content=raw.getvalue()
        item=ingest_upload(bridge.UPLOADS,io.BytesIO(content),len(content),'../../reference.wav')
        self.assertEqual(item['title'],'reference.wav')
        source, ref=resolve_reference(bridge.DATA,bridge.UPLOADS,item)
        prepared=Path(self.temp.name)/'prepared.wav'
        prepare_reference(source,prepared,3)
        self.assertAlmostEqual(audio_duration(prepared),3,places=2)
        workflow=apply_reference({'6':{'inputs':{}}},'prepared.wav',0.35,120)
        self.assertEqual(workflow['6']['inputs']['latent_image'],['10',0])
        self.assertEqual(workflow['6']['inputs']['denoise'],0.35)
        self.assertEqual(workflow['11']['inputs']['seconds_total'],120)
        with self.assertRaises(ValueError): ingest_upload(bridge.UPLOADS,io.BytesIO(b'bad'),3,'bad.mp3')
        with self.assertRaises(ValueError): ingest_upload(bridge.UPLOADS,io.BytesIO(content),len(content),'bad.exe')
        with self.assertRaises(ValueError): ingest_upload(bridge.UPLOADS,io.BytesIO(),51*1024*1024,'large.wav')


if __name__ == '__main__':
    unittest.main()
