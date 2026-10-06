const net = require('node:net');
const pipe = process.argv[process.argv.indexOf('--bridge-pipe') + 1];
const mode = process.argv[2];
if (mode === 'no-connect') setInterval(() => {}, 1000);
else {
  const connect = (wrong = false) => {
    const socket = net.createConnection(pipe);
    let buffer = '', ready = false, pending = [];
    const echo = message => socket.write(JSON.stringify({ type: 'echo', message }) + '\n');
    socket.on('connect', () => {
      socket.write(JSON.stringify({ type: 'bridge-hello', token: wrong ? 'wrong-token' : process.env.YUKIMI_BRIDGE_TOKEN }) + '\n');
      if (!wrong) {
        socket.write('{"type":"preferences","preferences":{"showSign":false}}\n{"type":');
        setTimeout(() => { socket.write('"ready"}\n'); ready = true; for (const message of pending) echo(message); pending = []; }, 5);
      }
    });
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (ready) echo(message); else pending.push(message);
      }
    });
    socket.on('error', () => {});
    socket.on('end', () => socket.end());
    socket.on('close', () => { if (wrong) connect(); else process.exit(0); });
  };
  connect(mode === 'bad-first');
}
