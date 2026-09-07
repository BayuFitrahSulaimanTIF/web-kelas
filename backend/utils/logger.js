// ===================================================
// LOGGER
// Output konsol dengan timestamp untuk request & error
// ===================================================

const timestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const format = (level, args) => {
  return `[${timestamp()}] [${level.toUpperCase()}] ${args.join(' ')}`;
};

module.exports = {
  info: (...args) => console.log(format('info', args)),
  warn: (...args) => console.warn(format('warn', args)),
  error: (...args) => console.error(format('error', args))
};
