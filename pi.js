const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

raspi.init(() => {
  var serial = new Serial({
    portId: '/dev/ttyAMA0',
    baudRate: 19200
  });
  // serial.on('data', (data) => {
  //   console.log('Got data', data)
  // })
  serial.open(async () => {
    // serial.write(Buffer.from([0x82])) // mode?
    //serial.write(Buffer.from([0x83])) // does control?


    await sleep(1000)
    serial.write(Buffer.from([0xD0, 0, 0]))
    await sleep(1000)
    serial.write(Buffer.from([0xe9]))
    serial.write(String.fromCharCode(14));
    serial.write(String.fromCharCode(14));
    await sleep(2000)
    serial.write(Buffer.from([0xD0, 0, 0]))
  })
})
