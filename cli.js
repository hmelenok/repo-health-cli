#!/usr/bin/env node
import meow from 'meow';
import unicornFun from 'unicorn-fun';

const cli = meow(`
	Usage
	  $ repo-health-cli [input]

	Options
	  --postfix  Lorem ipsum  [Default: rainbows]

	Examples
	  $ repo-health-cli
	  unicorns & rainbows
	  $ repo-health-cli ponies
	  ponies & rainbows
`, {
	flags: {
		postfix: {
			type: 'string',
			default: 'rainbows'
		}
	}
});

console.log(moduleName(cli.input[0] || 'unicorns', cli.flags));
