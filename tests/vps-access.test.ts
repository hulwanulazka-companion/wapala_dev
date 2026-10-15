import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('WAPALA sudo policy is exact-argument and contains no unrestricted passwordless grant',async()=>{
 const policy=await readFile('deploy/wapala-codex-sudo.conf','utf8');
 const rules=policy.split('\n').filter(line=>line&&!line.startsWith('#')).join('\n');
 assert.doesNotMatch(rules,/NOPASSWD:\s*ALL|\*/);
 assert.match(rules,/NOSETENV:/);
 const commands=[...rules.matchAll(/\/usr\/local\/sbin\/wapala-service ([a-z]+)/g)].map(m=>m[1]);
 assert.deepEqual(commands,['start','stop','restart','status']);
});
test('service wrapper validates one action and clears inherited environment before fixed unit operation',async()=>{
 const script=await readFile('deploy/wapala-service.sh','utf8');
 assert.match(script,/\[ "\$#" -ne 1 \]/);
 assert.match(script,/start\|stop\|restart\|status/);
 assert.match(script,/\/usr\/bin\/env -i PATH=/);
 assert.match(script,/\/usr\/bin\/systemctl --no-pager "\$1" wapala\.service/);
 assert.doesNotMatch(script,/eval|\$@|sudo|git|npm/);
});
