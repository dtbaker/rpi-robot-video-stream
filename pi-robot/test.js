const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;

// 01 = reverse
// 10 = forward

// Set Motor 1:
// C0 = 11000000 brake low
// C1 = 11000001 reverse
// C2 = 11000010 forward
// C3 = 11000011 brake low
// Set Motor 2
// C8 = 11001000 brake low
// C9 = 11001001 forward
// CA = 11001010 forward
// CB = 11001011 brake low
// Set both Motor 1 and 2
// D0 = 11010000 both stop
// D1 = 11010001 m1 reverse
// D2 = 11010010 m1 forward
// D4 = 11010100 m2 reverse
// D8 = 11011000 m2 forward
// D5 = 11010101 m1 reverse, m2 reverse
// DA = 11011010 m1 forward, m2 forward
// D9 = 11011001 m1 reverse, m2 forward
// D6 = 11010110 m1 forward, m2 reverse
// Accelerate Motor 1:
// C4 = 11000100 brake low
// C5 = 11000101 reverse
// C6 = 11000110 forward
// C7 = 11000111 brake low
// Accelerate Motor 2:
// CC = 11001100 brake low
// CD = 11001101 reverse
// CE = 11001110 forward
// CF = 11001111 brake low


function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const motorSpeed = 25
const turnSpeed = 22

raspi.init(() => {
  const serial = new Serial({
    portId: '/dev/ttyAMA0',
    baudRate: 19200
  });

  serial.open(async () => {
    serial.write(Buffer.from([0xE9, turnSpeed / 2, turnSpeed])) // spin right
    await sleep(900)
    serial.write(Buffer.from([0xCC, 20]))
    await sleep(4000)
    serial.write(Buffer.from([0xD0, 0, 0]))
    console.log('done')
    serial.close()
  })
})

