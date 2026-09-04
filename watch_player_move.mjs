async function waitMove() {
  try {
    const res = await fetch('http://localhost:8765/api/wait-move');
    const data = await res.json();
    console.log(JSON.stringify(data));
  } catch (err) {
    console.error('대기 실패:', err.message);
    process.exit(1);
  }
}

waitMove();
