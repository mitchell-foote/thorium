import fs from "fs";
import os from "os";
import path from "path";
import Store from "./data-store";

describe("data-store flushSync", () => {
  test("writes current data immediately, bypassing the throttle", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
    const file = path.join(dir, "snap.json");
    const store = new Store({name: "t", path: file, debounce: 60 * 1000});
    store.set({first: 1}, null); // leading-edge write
    store.set({second: 2}, null); // held by the throttle
    store.flushSync();
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      first: 1,
      second: 2,
    });
    fs.rmSync(dir, {recursive: true, force: true});
  });
});
