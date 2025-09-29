import net from 'net';

export function isPrinterReachable(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    // Convert port to number and use default 9100 if invalid
    const printerPort = parseInt(port) || 9100;

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect({
      host: ip,
      port: printerPort,
    });
  });
}
