// Minimal haxe.Unserializer port — the game stores its save as a Haxe-serialized string.
// Format ref: https://haxe.org/manual/std-serialization-format.html
export function unserialize(buf: string): unknown {
  let pos = 0;
  const scache: string[] = [];
  const cache: unknown[] = [];
  const NUM = /[0-9eE.+\-]/;

  const readInt = () => {
    const start = pos;
    if (buf.charAt(pos) === "-") pos++;
    while (pos < buf.length && buf.charAt(pos) >= "0" && buf.charAt(pos) <= "9") pos++;
    return parseInt(buf.slice(start, pos), 10);
  };
  const readFloat = () => {
    const start = pos;
    while (pos < buf.length && NUM.test(buf.charAt(pos))) pos++;
    return parseFloat(buf.slice(start, pos));
  };
  const readKey = (): string => {
    const v = read();
    if (typeof v !== "string") throw new Error(`object key not a string at ${pos}`);
    return v;
  };
  const readFields = (o: Record<string, unknown>) => {
    while (buf.charAt(pos) !== "g") o[readKey()] = read();
    pos++;
  };

  function read(): unknown {
    const c = buf.charAt(pos++);
    switch (c) {
      case "n": return null;
      case "t": return true;
      case "f": return false;
      case "z": return 0;
      case "i": return readInt();
      case "d": return readFloat();
      case "k": return NaN;
      case "m": return -Infinity;
      case "p": return Infinity;
      case "y": {
        const len = readInt();
        if (buf.charAt(pos++) !== ":") throw new Error(`bad string at ${pos}`);
        const s = decodeURIComponent(buf.slice(pos, pos + len));
        pos += len;
        scache.push(s);
        return s;
      }
      case "R": return scache[readInt()];
      case "r": return cache[readInt()];
      case "o": {
        const o: Record<string, unknown> = {};
        cache.push(o);
        readFields(o);
        return o;
      }
      case "a": {
        const a: unknown[] = [];
        cache.push(a);
        while (buf.charAt(pos) !== "h") {
          if (buf.charAt(pos) === "u") { pos++; const n = readInt(); for (let i = 0; i < n; i++) a.push(null); }
          else a.push(read());
        }
        pos++;
        return a;
      }
      case "l": {
        const a: unknown[] = [];
        cache.push(a);
        while (buf.charAt(pos) !== "h") a.push(read());
        pos++;
        return a;
      }
      case "b": {
        const o: Record<string, unknown> = {};
        cache.push(o);
        while (buf.charAt(pos) !== "h") o[readKey()] = read();
        pos++;
        return o;
      }
      case "q": {
        const o: Record<number, unknown> = {};
        cache.push(o);
        while (buf.charAt(pos) === ":") { pos++; o[readInt()] = read(); }
        if (buf.charAt(pos++) !== "h") throw new Error(`bad IntMap at ${pos}`);
        return o;
      }
      case "c": {
        const name = readKey();
        const o: Record<string, unknown> = { __class: name };
        cache.push(o);
        readFields(o);
        return o;
      }
      case "v": {
        // "YYYY-MM-DD HH:MM:SS" or a float timestamp
        if (/^\d{4}-/.test(buf.slice(pos, pos + 5))) { const s = buf.slice(pos, pos + 19); pos += 19; cache.push(s); return s; }
        const t = readFloat(); cache.push(t); return t;
      }
      default:
        throw new Error(`unsupported Haxe token '${c}' at ${pos - 1}: ${buf.slice(pos - 1, pos + 40)}`);
    }
  }

  const out = read();
  if (pos !== buf.length) throw new Error(`trailing data at ${pos}/${buf.length}`);
  return out;
}
