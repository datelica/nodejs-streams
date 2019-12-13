import ReadableCounter from './counter';
import log from './log';
import timer from './timer';

const dataLimit = 6;
const readable = new ReadableCounter(dataLimit);

readable.on('end', () => log('* end *'));

readable.pipe(process.stdout);

const mode = readable.isPaused() ? 'paused' : 'flowing';
log(`* ${mode} *`);

timer('unpipe', () => readable.unpipe(process.stdout), 2500);
timer('pipe', () => readable.pipe(process.stdout), 4500);

/* === CONSOLE OUTPUT ===

* flowing *

1
<0> flowing

2
<0> flowing

* unpipe *

<2> paused
<4> paused

* pipe *

3
4

5
<0> flowing

6
<0> flowing

<0> flowing

* end */
