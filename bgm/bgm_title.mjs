// Keep the player and its current position intact while editing a saved track.
export function addTitleEditor({card, actions, item, heading, request, onEditing, onSaved}) {
  const edit = document.createElement('button');
  edit.textContent = '제목 수정';
  edit.type = 'button';
  const form = document.createElement('form');
  form.className = 'rename-form';
  form.hidden = true;
  const label = document.createElement('label');
  label.textContent = '새 제목';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.required = true;
  label.append(input);
  const save = document.createElement('button');
  save.textContent = '저장';
  save.type = 'submit';
  const cancel = document.createElement('button');
  cancel.textContent = '취소';
  cancel.type = 'button';
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  form.append(label, save, cancel, feedback);
  card.append(form);
  actions.append(edit);

  function close() {
    form.hidden = true;
    edit.hidden = false;
    onEditing(false);
    edit.focus();
  }
  edit.onclick = () => {
    input.value = item.title;
    feedback.textContent = '';
    form.hidden = false;
    edit.hidden = true;
    onEditing(true);
    input.focus();
    input.select();
  };
  cancel.onclick = close;
  input.onkeydown = event => {
    if (event.key === 'Escape' && !save.disabled) {
      event.preventDefault();
      close();
    }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) { feedback.textContent = '제목을 입력해 주세요.'; input.focus(); return; }
    save.disabled = cancel.disabled = input.disabled = true;
    feedback.textContent = '저장 중…';
    try {
      const response = await request('/library/' + item.id + '/title', {
        method: 'POST', body: JSON.stringify({title})
      });
      const updated = await response.json();
      item.title = updated.title;
      heading.textContent = updated.title;
      onSaved();
      close();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      save.disabled = cancel.disabled = input.disabled = false;
    }
  };
}
