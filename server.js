const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http)

// This stuff accepts the inbound ffmpeg TCP stream and sends the data out to any connected websocket clients.
const net = require('net')
let firstPackets = []
const tcpServer = net.createServer(tcpSocket => {
  tcpSocket.on('end', function() {
    console.log('streamer disconnected');
    firstPackets = []
  });
  tcpSocket.on('data', data => {
    // Capture first few important frames which are required to be sent to any newly connected clients.
    if(firstPackets.length < 5){
      firstPackets.push(data)
    }
    // This sends the video frame out to any connected clients:
    io.emit('video', data)
  })
})
tcpServer.listen(9999, () => {
  console.log('tcp server started, ready to accept stream data');
})

// Basic web app with HTML page that loads video preview and websocket UI stuff
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
let clientCount = 0
io.on('connection', (socket) => {
  clientCount++
  io.emit('clientCount', clientCount)
  firstPackets.forEach(videoData => {
    // We have to send some first frames to the client so they can get in sync.
    socket.emit('video', videoData)
  })
  socket.on('disconnect', () => {
    clientCount--
    if(clientCount<0)clientCount = 0 // should never happen, but whatevs
    io.emit('clientCount', clientCount)
  });
});

http.listen(3000, () => {
  console.log('Open your browser to http://localhost:3000 ');
});
