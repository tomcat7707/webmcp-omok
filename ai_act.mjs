const [action, ...args] = process.argv.slice(2);

async function main() {
  if (action === 'get') {
    const res = await fetch('http://localhost:8765/api/board');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (action === 'play') {
    const x = parseInt(args[0], 10);
    const y = parseInt(args[1], 10);
    const comment = args.slice(2).join(' ');

    const res = await fetch('http://localhost:8765/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'place_stone',
        args: { x, y, color: 'white', comment }
      })
    });
    const result = await res.json();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (action === 'comment') {
    const message = args.join(' ');
    const res = await fetch('http://localhost:8765/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'post_ai_comment',
        args: { message, emotion: 'thinking' }
      })
    });
    const result = await res.json();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('사용법:');
  console.log('node ai_act.mjs get');
  console.log('node ai_act.mjs play <x> <y> [코멘트]');
  console.log('node ai_act.mjs comment <메시지>');
}

main().catch(console.error);
