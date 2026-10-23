(() => {
  const root = document.getElementById('holly-calendar');
  if (!root) return;
  const records = JSON.parse(document.getElementById('holly-cal-data').textContent);
  const now = new Date();
  const today = { y:now.getFullYear(), m:now.getMonth()+1, d:now.getDate() };
  const months = [new Date(today.y,today.m-1,1),new Date(today.y,today.m,1)];
  let index = 0;
  const monthText = document.getElementById('holly-cal-month');
  const body = document.getElementById('holly-cal-body');
  const memo = document.getElementById('holly-cal-memo');
  const prev = document.getElementById('holly-cal-prev');
  const next = document.getElementById('holly-cal-next');
  const pad = n => String(n).padStart(2,'0');
  function render() {
    const date = months[index], y=date.getFullYear(), m=date.getMonth()+1;
    const key = `${y}-${pad(m)}`, entry = records[key];
    monthText.textContent=`${y}年${m}月`;
    prev.disabled=index===0; next.disabled=index===months.length-1;
    memo.hidden=true; memo.textContent=''; body.replaceChildren();
    if(!entry) { const p=document.createElement('p');p.className='holly-cal-pending';p.textContent='営業予定を調整中です';body.append(p);return; }
    const grid=document.createElement('div');grid.className='holly-cal-grid';
    for (const name of ['月','火','水','木','金','土','日']) {
      const el=document.createElement('div');el.className='holly-cal-weekday';el.textContent=name;grid.append(el);
    }
    const offset = (new Date(y,m-1,1).getDay()+6)%7; // v05.5: 月曜始まり、日曜は右端
    const days = new Date(y,m,0).getDate();
    const closed=new Set(entry.closed||[]);
    const notes=entry.memo||{};
    for(let i=0;i<42;i++) {
      const d=i-offset+1, inside=d>=1 && d<=days;
      const note=inside && typeof notes[String(d)]==='string' ? notes[String(d)] : '';
      const el=document.createElement(note?'button':'div');
      el.className='holly-cal-day';
      if(!inside) {el.classList.add('is-outside');grid.append(el);continue;}
      if(closed.has(d))el.classList.add('is-closed');
      if(y===today.y&&m===today.m&&d===today.d)el.classList.add('is-today');
      if(new Date(y,m-1,d)<new Date(today.y,today.m-1,today.d))el.classList.add('is-past');
      const number=document.createElement('span');number.className='holly-cal-number';number.textContent=d;
      const dotspace=document.createElement('span');dotspace.className='holly-cal-dot-space';
      if(note) { const dot=document.createElement('span');dot.className='holly-cal-dot';dotspace.append(dot);
        el.type='button';el.setAttribute('aria-label',`${m}月${d}日のお知らせを表示`);
        el.addEventListener('click',()=>{memo.textContent=`${m}月${d}日\n${note}`;memo.hidden=false;});
      }
      el.append(number,dotspace);grid.append(el);
    }
    body.append(grid);
  }
  prev.addEventListener('click',()=>{if(index>0){index--;render();}});
  next.addEventListener('click',()=>{if(index<months.length-1){index++;render();}});
  render();
})();
