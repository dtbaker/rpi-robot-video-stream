const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http)

const config = {
  tcpServerPort: 9999,
  webServerPort: 3000
}

const moveVotes = {
  left: 0,
  right: 0,
  forward: 0,
  back: 0
}

let latestImageData = null

// Basic web app with HTML page that loads video preview and websocket UI stuff
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/server.html');
});
let clientCount = 0
io.on('connection', (socket) => {
  clientCount++
  io.emit('clientCount', clientCount)
  socket.on('moveRobot', (direction) => {
    if (direction && ['forward', 'back', 'left', 'right'].includes(direction)) {
      moveVotes[direction]++
    }
  })
  socket.on('disconnect', () => {
    clientCount--
    if (clientCount < 0) clientCount = 0 // should never happen, but whatevs
    io.emit('clientCount', clientCount)
  });
});

setInterval(() => {
  // purge the votes to the robot every so often, let it choose what to do.
  if (moveVotes.left > 0 || moveVotes.right > 0 || moveVotes.forward > 0 || moveVotes.back > 0) {
    io.emit('moveVotes', moveVotes);
    moveVotes.left = 0
    moveVotes.right = 0
    moveVotes.forward = 0
    moveVotes.back = 0
  }
}, 500)

http.listen(config.webServerPort, () => {
  console.log(`Open your browser to http://localhost:${config.webServerPort}`);
});
