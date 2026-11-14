import App from "../app";

// Flush the snapshot to disk when the server process is asked to stop, so
// changes made inside the store's 30s throttle window aren't lost. The Electron
// shell stops the server with child.kill() (SIGTERM).
export default () => {
  if (process.env.NODE_ENV !== "production") {
    return Promise.resolve();
  }
  let shuttingDown = false;
  const handler = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      App.flushSnapshot();
    } catch (err) {
      console.error("Failed to flush snapshot on shutdown:", err);
    }
    process.exit(0);
  };
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
  return Promise.resolve();
};
