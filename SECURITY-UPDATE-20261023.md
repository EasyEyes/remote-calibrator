# Security update: 2026-10-23

Pin Node.js 22.23.4 and Bun 1.4.4. Node engines also allow the patched 24.22.1 and 26.12.1 release lines. Update the committed binary Bun lockfile and compatible dependencies, including transitive security patches. The parent project's ignored, untracked npm lockfile is not authoritative and was neither staged nor deleted. CI and setup use Bun; no lockfile approval is needed.

[Node.js security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). [Bun dependency update behavior](https://bun.com/docs/pm/cli/update).

## Verification and limitations

Bun frozen installation passes with scripts disabled. The Node-targeted Mocha bundle now uses native Node APIs instead of browser polyfills; its previous Buffer resolution error is fixed. All 143 tests pass on Node 22.23.4. Production webpack build passes with bundle-size warnings. Native/postinstall scripts for Biome and Parcel remain blocked; no blanket trust was added.

Native Bun audit: **0 critical** findings. 3 package names still have advisories. Remaining findings are deferred for compatibility/reachability review by 2026-10-30 and are not claimed harmless.

- `braces`: [braces vulnerable to stack-exhaustion denial of service through deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (high)
- `uuid`: [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) (moderate)
- `serialize-javascript`: [Serialize JavaScript has CPU Exhaustion Denial of Service via crafted array-like objects](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) (moderate); [Serialize JavaScript is Vulnerable to RCE via RegExp.flags and Date.prototype.toISOString()](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) (high)

## Regression scenario

Use the pinned Node and Bun versions; run `bun install --frozen-lockfile --ignore-scripts` in WebGazer4RC and the parent. Review any blocked scripts before selectively enabling them. Run parent `bun run test` and `bun run build`. In a preview, complete camera permission, face/hand detection and distance calibration, exercise a new-object restart, and confirm gaze output remains finite. The hardware/browser scenario is planned, not executed. Re-run `bun audit` before release.
