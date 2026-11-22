const app = require('../src/app')

const server = app.listen(0, '127.0.0.1', () => {
  if (process.send) process.send({ port: server.address().port })
})

process.on('message', (message) => {
  if (message !== 'shutdown') return
  server.close(() => process.exit(0))
})
