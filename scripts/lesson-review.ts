import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import {
  parseLessonDraft,
  type LessonDraft,
} from '@learn-anything/lesson-schema';
import { lessonCapabilities } from '../capabilities/index.ts';

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>审核课程材料</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f5f0;color:#282d2b;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:920px;margin:auto;padding:32px 18px 90px}h1{font-size:30px;margin:0}h2{font-size:21px;margin:0 0 16px}h3{font-size:17px;margin:18px 0 8px}.hint{color:#606b66}section{background:white;border:1px solid #dddcd5;border-radius:14px;padding:24px;margin:20px 0}label{display:block;font-weight:600;margin:12px 0 4px}input,textarea,select{width:100%;font:inherit;border:1px solid #b6bdb6;border-radius:8px;padding:10px;background:#fff;color:inherit}textarea{min-height:110px;resize:vertical}input[type=checkbox]{width:auto}input[type=number]{max-width:180px}.row{margin:12px 0}.nested{border-left:2px solid #e3e5df;padding-left:16px;margin:12px 0}details{margin:10px 0}summary{cursor:pointer;font-weight:600}button{background:#235e50;color:white;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer;margin:8px 8px 0 0}button.secondary{background:#e7ebe5;color:#235e50}button:disabled{opacity:.6;cursor:default}#status{white-space:pre-wrap;margin:14px 0;color:#9b392e}#status.ok{color:#235e50}small{display:block;color:#66716b}header{margin-bottom:24px}
</style></head><body><main><header><h1>审核课程材料</h1><p class="hint">阅读并直接修改标题、旁白、板书与图示安排。课程标识和引用保持固定。审核通过后，程序会检查材料，再开始语音和课程编译。</p></header><div id="editor">正在读取材料…</div><p id="status" role="status"></p><button id="approve" disabled>审核通过，开始编译</button><button id="cancel" class="secondary">取消本次审核</button></main><script>
const labels={title:'课程标题',eyebrow:'课程副标题',diagramTitle:'图区标题',notesTitle:'板书区标题',label:'章节名称',text:'旁白／板书文字',visualId:'对应图示',emphasis:'局部重点',phrase:'讲到这句时',occurrence:'第几次出现',edge:'出现位置',offset:'提前／延后（秒）',when:'配合哪句旁白',item:'板书内容',tone:'文字语气',kind:'呈现方式',underline:'下划线',config:'图示内容',points:'点位',nodes:'节点',edges:'连线',elements:'图中元素',relations:'元素之间的关系',from:'起点',to:'终点',width:'宽度',height:'高度',x:'横向位置／数值',y:'纵向位置／数值',xLabel:'横轴标题',yLabel:'纵轴标题',action:'图示动作',payload:'动作内容',notes:'说明',name:'名称',at:'出现时机','$time':'随哪句旁白出现',mark:'标记',region:'区域',start:'开始',end:'结束',index:'序号',values:'值',value:'数值',duration:'持续秒数',position:'位置',color:'颜色',fill:'填充色',stroke:'线条色',caption:'说明文字'};
const diagramTypes={flow:'流程图',plot:'曲线图','state-transition':'状态变化图','array-search':'数组查找图',scene:'场景图'};
const fixed=new Set(['id','draftVersion','boardMode','grammar','type','visualId','segment','action']);
let material;
const editor=document.getElementById('editor'),status=document.getElementById('status'),approve=document.getElementById('approve');
const make=(tag,parent)=>{const el=document.createElement(tag);parent.append(el);return el};
function field(parent,key,value,container,immutable=false){
 immutable=immutable===true;
 const name=labels[key]||key;
 if(value===null||value===undefined)return;
 if(Array.isArray(value)){const detail=make('details',parent),head=make('summary',detail);head.textContent=name+'（'+value.length+'项）';detail.open=['emphasis','nodes','points'].includes(key);const body=make('div',detail);body.className='nested';value.forEach((item,i)=>field(body,'第'+(i+1)+'项',item,value,i));return}
 if(typeof value==='object'){const detail=make('details',parent),head=make('summary',detail);head.textContent=name;detail.open=['when','item','config'].includes(key);const body=make('div',detail);body.className='nested';Object.entries(value).forEach(([child,item])=>field(body,child,item,value,child,immutable||fixed.has(key)));return}
 if(['id','draftVersion','boardMode','grammar','type'].includes(key))return;
 const row=make('div',parent);row.className='row';const label=make('label',row);label.textContent=name;
 if(immutable||fixed.has(key)){const small=make('small',row);small.textContent=key==='visualId'?'图示 '+(material.visuals.findIndex(item=>item.id===value)+1):key==='segment'?'第 '+(material.segments.findIndex(item=>item.id===value)+1)+' 段':String(value);return}
 let input;
 if(typeof value==='boolean'){input=make('input',label);input.type='checkbox';input.checked=value;input.addEventListener('change',()=>container[key]=input.checked)}
 else if(typeof value==='number'){input=make('input',label);input.type='number';input.step='any';input.value=value;input.addEventListener('input',()=>container[key]=input.value===''?null:Number(input.value))}
 else if(key==='text'||value.length>100){input=make('textarea',label);input.value=value;input.addEventListener('input',()=>container[key]=input.value)}
 else {input=make('input',label);input.value=value;input.addEventListener('input',()=>container[key]=input.value)}
}
function render(){editor.replaceChildren();const basics=make('section',editor);make('h2',basics).textContent='课程信息';for(const key of ['title','eyebrow'])field(basics,key,material[key],material,key);for(const key of ['diagramTitle','notesTitle'])field(basics,key,material.presentation[key],material.presentation,key);
 const segments=make('section',editor);make('h2',segments).textContent='讲解材料';material.segments.forEach((segment,i)=>{const group=make('div',segments);group.className='nested';make('h3',group).textContent='第 '+(i+1)+' 段';for(const key of ['label','text','visualId','emphasis'])field(group,key,segment[key],segment,key)});
 const visual=make('section',editor);make('h2',visual).textContent='图示安排';material.visuals.forEach((item,i)=>{const group=make('div',visual);group.className='nested';make('h3',group).textContent='图示 '+(i+1)+' · '+(diagramTypes[item.grammar]||'图示');field(group,'config',item.config,item,'config')});
 const events=make('section',editor);make('h2',events).textContent='板书与图示动作';material.events.forEach((event,i)=>{const detail=make('details',events);const summary=make('summary',detail);summary.textContent=(i+1)+' · '+({'board.write':'写板书','board.remove':'擦除板书','board.mark':'标记','visual':'图示动作'}[event.type]||event.type);const body=make('div',detail);body.className='nested';Object.entries(event).filter(([key])=>key!=='type').forEach(([key,value])=>field(body,key,value,event,key))});approve.disabled=false}
function message(value,ok=false){status.textContent=value;status.className=ok?'ok':''}
async function submit(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'材料未通过检查，请核对修改。');return data}
fetch('material').then(r=>r.json()).then(value=>{material=value;render()}).catch(()=>message('无法读取材料，请关闭本页后重新启动审核。'));
approve.onclick=async()=>{approve.disabled=true;try{await submit('approve',material);editor.replaceChildren();message('审核完成。终端正在编译课程，可以关闭本页。',true)}catch(error){message(error.message);approve.disabled=false}};
document.getElementById('cancel').onclick=async()=>{try{await submit('cancel',{});approve.disabled=true;editor.replaceChildren();message('本次审核已取消，没有开始语音编译。',true)}catch{message('无法取消，请在终端按 Ctrl+C 结束。')}};
</script></body></html>`;

// A local, one-course editor. The browser never receives project files or credentials.
export async function startLessonReview(
  draft: LessonDraft,
  options: { port?: number; signal?: AbortSignal } = {},
): Promise<{
  url: string;
  result: Promise<LessonDraft>;
  close(): Promise<void>;
}> {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('本地审核端口无效。');
  const prefix = `/${randomBytes(16).toString('hex')}/`;
  let settle!: (value: LessonDraft) => void;
  let reject!: (error: Error) => void;
  const result = new Promise<LessonDraft>((resolve, fail) => {
    settle = resolve;
    reject = fail;
  });
  void result.catch(() => {}); // Cancellation may precede a caller awaiting approval.
  let finished = false;
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const address = server.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.headers.host !== `127.0.0.1:${address.port}`
    ) {
      response.writeHead(403).end();
      return;
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const path = request.url?.split('?')[0];
    if (!path?.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const resource = path.slice(prefix.length);
    if (
      request.method === 'GET' &&
      (resource === '' || resource === 'material')
    ) {
      response.setHeader(
        'Content-Type',
        resource
          ? 'application/json; charset=utf-8'
          : 'text/html; charset=utf-8',
      );
      response.end(resource ? JSON.stringify(draft) : page);
      return;
    }
    if (
      request.method !== 'POST' ||
      !['approve', 'cancel'].includes(resource)
    ) {
      response.writeHead(404).end();
      return;
    }
    if (
      finished ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      response.writeHead(415).end();
      return;
    }
    if (resource === 'cancel') {
      finished = true;
      response.setHeader('Content-Type', 'application/json');
      response.end('{"ok":true}');
      reject(new Error('课程任务已取消。'));
      return;
    }
    const receive = async () => {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1_000_000) {
          response.writeHead(413).end();
          return;
        }
      }
      let revised: LessonDraft;
      try {
        revised = parseLessonDraft(JSON.parse(body), lessonCapabilities);
        if (
          revised.id !== draft.id ||
          revised.segments.some(
            (segment, index) => segment.id !== draft.segments[index]?.id,
          ) ||
          revised.visuals.some(
            (visual, index) =>
              visual.id !== draft.visuals[index]?.id ||
              visual.grammar !== draft.visuals[index]?.grammar,
          ) ||
          revised.segments.length !== draft.segments.length ||
          revised.visuals.length !== draft.visuals.length
        )
          throw new Error('课程引用已改变。');
      } catch {
        response.writeHead(422, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            error:
              '修改后材料未通过校验。请检查旁白中的重点／动作短语、图示内容及课程引用。',
          }),
        );
        return;
      }
      finished = true;
      response.setHeader('Content-Type', 'application/json');
      response.end('{"ok":true}');
      settle(revised);
    };
    void receive().catch(() => {
      if (!response.headersSent) response.writeHead(503).end();
    });
  });
  await new Promise<void>((resolve, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('审核服务启动失败。');
  const close = async () => {
    if (!finished) {
      finished = true;
      reject(new Error('课程任务已取消。'));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  options.signal?.addEventListener('abort', () => void close(), { once: true });
  return { url: `http://127.0.0.1:${address.port}${prefix}`, result, close };
}
