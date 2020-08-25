const app = require('express')();
const multer = require('multer');
const upload = multer();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const os = require("os");
const basicAuth = require('express-basic-auth')
const pubsub = require("pubsub-js")

const config = {
  webServerPort: process.env.PORT || 3000,
  webServerPassword: process.env.PASSWORD
}

const moveVotes = {
  left: 0,
  right: 0,
  forward: 0,
  back: 0
}

let latestImageData = null

if(config.webServerPassword) {
  app.use(basicAuth({
    users: {'admin': config.webServerPassword},
    challenge: true
  }))
}

// Basic web app with HTML page that loads video preview and websocket UI stuff
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/server.html');
});
app.post('/post', upload.single('file'), (req, res) => {
  pubsub.publish('MJPEG', Buffer.from(req.file.buffer.toString('utf8'), 'base64'));
});
app.get('/stream', (req, res) => {
  const boundaryID = 'picameraimage'
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace;boundary="' + boundaryID + '"',
    'Connection': 'keep-alive',
    'Expires': 'Fri, 27 May 1977 00:00:00 GMT',
    'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
    'Pragma': 'no-cache'
  });
  const subscriber_token = pubsub.subscribe('MJPEG', function(msg, data) {
    res.write('--' + boundaryID + '\r\n')
    res.write('Content-Type: image/jpeg\r\n');
    res.write('Content-Length: ' + data.length + '\r\n');
    res.write("\r\n");
    res.write(data);
    res.write("\r\n");
  });
  res.on('close', function() {
    pubsub.unsubscribe(subscriber_token);
    res.end();
  });
});
let clientCount = 0
io.on('connection', (socket) => {
  clientCount++
  io.emit('clientCount', clientCount)
  socket.on('moveRobotVote', (direction) => {
    if (direction && ['forward', 'back', 'left', 'right'].includes(direction)) {
      moveVotes[direction]++
      io.emit('moveVotes', moveVotes);
    }
  })
  socket.on('moveRobotComplete', (direction) => {
    moveVotes.left = 0
    moveVotes.right = 0
    moveVotes.forward = 0
    moveVotes.back = 0
    io.emit('lastMoveDirection', direction);
    io.emit('moveVotes', moveVotes);
  })
  socket.on('disconnect', () => {
    clientCount--
    if (clientCount < 0) clientCount = 0 // should never happen, but whatevs
    io.emit('clientCount', clientCount)
  });
});

http.listen(config.webServerPort, () => {
  console.log(`Open your browser to http://localhost:${config.webServerPort}`);
});
