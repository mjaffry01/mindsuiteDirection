'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// A small JSON-file store. Writes are serialised and atomic (write to a
// temporary file, then rename), so a crash never leaves a half-written file.
class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = null;
    this.queue = Promise.resolve();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const base = JSON.parse(JSON.stringify(this.defaults));
    if (fs.existsSync(this.file)) {
      this.data = { ...base, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } else {
      this.data = base;
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    }
    return this.data;
  }

  get() {
    return this.data;
  }

  async update(mutator) {
    const result = mutator(this.data);
    this.data.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, this.file);
    });
    await this.queue;
    return result;
  }
}

module.exports = { JsonStore };
