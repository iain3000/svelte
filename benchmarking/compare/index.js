import fs from 'node:fs';
import path from 'node:path';
import { execSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// if (execSync('git status --porcelain').toString().trim()) {
// 	console.error('Working directory is not clean');
// 	process.exit(1);
// }

const filename = fileURLToPath(import.meta.url);
const runner = path.resolve(filename, '../runner.js');
const outdir = path.resolve(filename, '../.results');

if (fs.existsSync(outdir)) fs.rmSync(outdir, { recursive: true });
fs.mkdirSync(outdir);

const branches = [];

for (const arg of process.argv.slice(2)) {
	if (arg.startsWith('--')) continue;
	if (arg === filename) continue;

	branches.push(arg);
}

if (branches.length === 0) {
	branches.push(
		execSync('git symbolic-ref --short -q HEAD || git rev-parse --short HEAD').toString().trim()
	);
}

if (branches.length === 1) {
	branches.push('main');
}

process.on('exit', () => {
	execSync(`git checkout ${branches[0]}`);
});

for (const branch of branches) {
	console.group(`Benchmarking ${branch}`);

	execSync(`git checkout ${branch}`);

	await new Promise((fulfil, reject) => {
		const child = fork(runner);

		child.on('message', (results) => {
			fs.writeFileSync(`${outdir}/${branch}.json`, JSON.stringify(results, null, '  '));
			fulfil();
		});

		child.on('error', reject);
	});

	console.groupEnd();
}

const results = branches.map((branch) => {
	return JSON.parse(fs.readFileSync(`${outdir}/${branch}.json`, 'utf-8'));
});

for (let i = 0; i < results[0].length; i += 1) {
	console.group(`${results[0][i].benchmark}`);

	for (const metric of ['time', 'gc_time']) {
		const times = results.map((result) => +result[i][metric]);
		let min = Infinity;
		let max = -Infinity;
		let min_index = -1;

		for (let b = 0; b < times.length; b += 1) {
			const time = times[b];

			if (time < min) {
				min = time;
				min_index = b;
			}

			if (time > max) {
				max = time;
			}
		}

		if (min !== 0) {
			console.group(`${metric}: fastest is ${char(min_index)} (${branches[min_index]})`);
			times.forEach((time, b) => {
				const SIZE = 20;
				const n = Math.round(SIZE * (time / max));

				console.log(`${char(b)}: ${'◼'.repeat(n)}${' '.repeat(SIZE - n)} ${time.toFixed(2)}ms`);
			});
			console.groupEnd();
		}
	}

	console.groupEnd();
}

function char(i) {
	return String.fromCharCode(97 + i);
}
