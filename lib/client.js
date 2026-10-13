window.__ModuleLoader__.load({
	id: "dsh-yukimi-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		const inject = ["timer", "theme", "slots", "connection"];
		const sessionHeaderSelector = "[data-windows-titlebar] [data-slot=\"conversation.header\"] > header[data-window-drag]:has([data-conversation-tabs])";

		const css = [
			"body {",
			"  background-color: #eef2fa;",
			"  background-image: var(--yukimi-bg, url('https://patchwiki.biligame.com/images/imascg/4/40/9qylnl62pskrgo7hqfrrqi1pidi5qan.png'));",
			"  background-repeat: no-repeat;",
			"  background-attachment: fixed;",
			"  background-position: center center;",
			"  background-size: cover;",
			"}",
			"body[data-ds-dark-theme] {",
			"  background-color: #0d1026;",
			"}",
			"/* Windows paints the shell frame with the sidebar fill; reveal the card behind it. */",
			"[data-windows-titlebar] div:has(> [data-shell-overlay]) { background: transparent; }",
			"@keyframes yukimi-flip {",
			"  0% { transform: rotateY(0deg); }",
			"  100% { transform: rotateY(360deg); }",
			"}",
			"@keyframes yukimi-idle {",
			"  0%, 100% { transform: translateY(0); }",
			"  50% { transform: translateY(-6px); }",
			"}",
			".yukimi-pet { --yukimi-pet-size: clamp(120px, 18vw, 220px); }",
			".yukimi-pet button:focus-visible, .yukimi-mobamas button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }",
			".yukimi-pet-panel { box-sizing: border-box; }",
			"@media (max-width: 1099px), (max-height: 639px) { .yukimi-mobamas, .yukimi-sign { display: none; } }",
			"@media (prefers-reduced-motion: reduce) { .yukimi-pet img { animation: none !important; } }",
			"/* Readability is local to content, leaving the card illustration visible between messages. */",
			"[data-chat-flow-kind]:where(:not([data-chat-flow-kind=user]):not([data-chat-flow-kind=turn-tail]):not([hidden]):not([data-turn-process-hidden])) { --dsw-alias-markdown-code-block: var(--yukimi-history-code-surface); background: var(--yukimi-history-surface); border-radius: 12px; padding: 8px 12px; box-sizing: border-box; }",
			"[data-slot=\"conversation.session.header\"] > * { background: var(--yukimi-reading-surface); }",
			"/* One local navigation surface keeps the title and tabs aligned over the artwork. */",
			sessionHeaderSelector + " { margin: 10px 12px 8px; padding-block: 8px 0; border: 1px solid var(--yukimi-surface-stroke); border-radius: 14px; background: var(--yukimi-header-surface); box-shadow: 0 4px 18px rgba(9,15,42,.16); }",
			sessionHeaderSelector + " [data-slot=\"conversation.session.header\"] > * { background: transparent; }",
			sessionHeaderSelector + " [data-conversation-tabs] { gap: 6px; margin-top: 6px; padding: 0 0 8px; border-bottom: 0; }",
			sessionHeaderSelector + " [data-conversation-tabs] [role=tab] { min-height: 28px; padding: 6px 12px; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); }",
			sessionHeaderSelector + " [data-conversation-tabs] [role=tab]::after { display: none; }",
			sessionHeaderSelector + " [data-conversation-tabs] [role=tab]:hover { background: var(--yukimi-focus-halo); }",
			sessionHeaderSelector + " [data-conversation-tabs] [role=tab][aria-selected=true] { background: var(--dsw-specific-bubble); color: var(--dsw-alias-label-primary); font-weight: 600; box-shadow: inset 0 0 0 1px var(--yukimi-surface-stroke); }",
			"@media (max-width: 600px) { " + sessionHeaderSelector + " { margin: 8px 8px 6px; border-radius: 12px; } }",
			"/* Conversation surfaces use host semantic markers, never generated class names. */",
			"[data-chat-flow-kind=assistant-step]:not([hidden]):not([data-turn-process-hidden]) { border: 1px solid var(--yukimi-history-stroke); border-radius: 20px; padding: 18px 22px; box-shadow: 0 4px 20px rgba(13,25,60,.055); }",
			"[data-chat-flow-kind=assistant-step] p, [data-chat-flow-kind=assistant-step] li { line-height: 1.8; }",
			"[data-chat-flow-kind=user] [data-slot=\"conversation.message.images\"] + div { border-radius: 20px 20px 6px 20px; padding: 13px 18px; border: 1px solid var(--yukimi-history-stroke); box-shadow: 0 3px 12px rgba(13,25,60,.06); line-height: 1.75; }",
			"[data-chat-flow-kind=turn-process]:not([hidden]):not([data-turn-process-hidden]) { border: 1px solid var(--yukimi-history-stroke); border-radius: 16px; padding: 7px 12px; }",
			"[data-chat-flow-kind=turn-process]:not(:has([aria-expanded=true])) { width: fit-content; max-width: 100%; }",
			"[data-chat-flow-kind=turn-tail] button { border-radius: 8px; }",
			"/* An opaque card masks scrolled messages; retain the host dock gradient and upward menus. */",
			"[data-composer-card] { background: var(--yukimi-composer-surface); border: 1px solid var(--yukimi-surface-stroke); border-radius: 24px; box-shadow: 0 10px 32px rgba(13,25,60,.13), 0 2px 6px rgba(13,25,60,.05); transition: box-shadow .18s ease, border-color .18s ease; }",
			"[data-composer-card]:focus-within { border-color: var(--yukimi-composer-focus-border); box-shadow: 0 0 0 2px var(--yukimi-composer-focus-ring), 0 0 24px 5px var(--yukimi-composer-focus-glow), 0 10px 32px rgba(13,25,60,.13); }",
			"[data-composer-input] { min-height: 52px; padding-top: 4px; line-height: 1.7; caret-color: var(--dsw-alias-brand-primary); }",
			"[data-composer-card] button { border-radius: 10px; transition: background-color .15s ease, box-shadow .15s ease; }",
			"[data-composer-card] button:focus-visible { outline: 2px solid var(--dsw-alias-border-l2); outline-offset: 3px; }",
			"[data-composer-card] button[aria-label=\"发送消息\"], [data-composer-card] button[aria-label=\"Send message\"] { width: 36px; height: 36px; border-radius: 12px; }",
			"[data-composer-card] button[aria-label=\"发送消息\"]:not(:disabled), [data-composer-card] button[aria-label=\"Send message\"]:not(:disabled) { background: var(--dsw-alias-brand-primary); color: #fff; box-shadow: 0 3px 9px var(--yukimi-focus-halo); }",
			"@media (max-width: 600px) { [data-chat-flow-kind=assistant-step]:not([hidden]):not([data-turn-process-hidden]) { padding: 14px 16px; border-radius: 16px; } [data-composer-card] { border-radius: 20px; } }",
			"@media (prefers-reduced-motion: reduce) { [data-composer-card], [data-composer-card] button { transition: none; } }",
		].join("\n");

		function apply(ctx) {
			const theme = ctx.get("theme");
			if (theme !== undefined) {
				const tokens = {
					"--dsw-alias-bg-base": { light: "rgba(240,244,252,0.08)", dark: "rgba(13,16,38,0.08)" },
					"--yukimi-surface-stroke": { light: "rgba(255,255,255,0.8)", dark: "rgba(150,171,230,0.20)" },
					"--yukimi-composer-surface": { light: "#fafcff", dark: "#161a3a" },
					"--yukimi-composer-focus-border": { light: "rgba(106,125,199,0.40)", dark: "rgba(160,174,243,0.45)" },
					"--yukimi-composer-focus-ring": { light: "rgba(130,149,230,0.10)", dark: "rgba(153,169,255,0.12)" },
					"--yukimi-composer-focus-glow": { light: "rgba(112,133,218,0.14)", dark: "rgba(124,144,241,0.20)" },
					"--yukimi-header-surface": { light: "rgba(246,249,255,0.92)", dark: "rgba(22,26,58,0.86)" },
					"--yukimi-focus-halo": { light: "rgba(37,130,200,0.13)", dark: "rgba(79,227,225,0.13)" },
					"--yukimi-reading-surface": { light: "rgba(240,244,252,0.90)", dark: "rgba(13,16,38,0.90)" },
					"--yukimi-history-surface": { light: "rgba(240,244,252,0.86)", dark: "rgba(13,16,38,0.80)" },
					"--yukimi-history-code-surface": { light: "rgba(255,255,255,0.90)", dark: "rgba(22,26,58,0.88)" },
					"--yukimi-history-stroke": { light: "rgba(255,255,255,0.55)", dark: "rgba(150,171,230,0.12)" },
					"--dsw-specific-bubble": { light: "#e3eafa", dark: "#252d50" },
					"--dsw-alias-markdown-code-block": { light: "#ffffff", dark: "#161a3a" },
					"--dsw-alias-markdown-code-block-banner": { light: "#e3eafa", dark: "#252d50" },
					"--dsw-alias-markdown-inline-code": { light: "#e3eafa", dark: "#252d50" },
					"--dsw-alias-bg-layer-1": { light: "#ffffff", dark: "#161a3a" },
					"--dsw-alias-bg-layer-2": { light: "#eef1f8", dark: "#1e2348" },
					"--dsw-alias-bg-overlay": { light: "#ffffff", dark: "#1b1f42" },
					"--dsw-alias-border-l1": { light: "#dbe2f0", dark: "rgba(120,140,200,0.18)" },
					"--dsw-alias-border-l2": { light: "#2582C8", dark: "#4fe3e1" },
					"--dsw-alias-brand-primary": { light: "#171C8F", dark: "#4d6bfe" },
					"--dsw-alias-label-primary": { light: "#1b2440", dark: "#f2f5ff" },
					"--dsw-alias-label-secondary": { light: "#495777", dark: "#aab4d4" },
					"--dsw-alias-state-error-primary": { light: "#d64545", dark: "#ff6b6b" },
					"--dsw-alias-state-success-primary": { light: "#31b56a", dark: "#3dd68c" },
					"--dsw-alias-state-warn-primary": { light: "#e6a23c", dark: "#f0b429" },
					"--dsw-specific-sidebar-fill": { light: "rgba(214,226,248,0.97)", dark: "rgba(20,24,51,0.97)" },
				};
				ctx.effect(() => theme.overrideTokens("yukimi-sajo", tokens));
			}

			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-yukimi-theme";
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => tag.remove();
			});

			// BEGIN YUKIMI_ASSETS (generated from lib/assets.js)
			const SIGN_URL = "https://patchwiki.biligame.com/images/imascg/6/62/1w7uaneo9yw5ps9s8ts843pvc99x3zk.png";
			const IMG = "https://patchwiki.biligame.com/images/imascg/";

			const ICONS = [
				"8/8b/ing01go9a5qd2kucddkckwbifsjo4d3.png",
				"8/8e/7w9z8hwrpnboketav10skclfa1cn50f.png",
				"1/18/66l9m5mrlf7nf75lwshn0tunntp2c2i.png",
				"f/f3/kwccpkj39yt5gp9h0vwn32tjkovli12.png",
				"a/a1/s8gpxcuy41p9z7oanrnxjda1axrqmvv.png",
				"1/17/tgvn9p30l9zr2ckx1wzkdokc71fjjnd.png",
				"b/b7/n84ir0nr97kg5wh38bt15hoyqd1psr0.png",
				"b/ba/opx7sej6fnfbmaesdycx7eettxzybqe.png",
				"d/d9/au4ncgsa9qkz9zc7eyzpjl3h3gsvq5h.png",
				"0/00/mkrma80t5z4armnuivcfa2pjso2skv7.png",
				"9/97/nc0r5y72k1olq3182h70yhidvba1ror.png",
				"5/5a/nwe33wnxg41b1whba9speyeide4ueyh.png",
				"6/66/a5ydvlwluiuy7azoneiyai7rjeo8b78.png",
			];

			const PETITS = [
				["7/7f/6currqdaigi46vyxec0tmzkyybgnas8.png", "d/d5/6hitk3tgbmwln3o6p3zvk4vl77yczv9.png", "d/d4/snlj1f98vxoxyaz19ci3eyv1zj33nx5.png", "3/31/kd1lus7rthpitvlsh3efgltjck7pn9g.png"],
				["3/37/p93o5mirwf40u38kybyyn1x6tmf7kta.png", "1/13/c2taxfxixkgqdnzikflg1jm0l47j15r.png", "2/2f/nxbtpk06h71plh0it00dcw9gljr0kru.png", "e/e7/qrh1epfq4aricofastvazf2nhxgi591.png"],
				["f/f3/awe2krnvkyki6gdepmqs0eie3kdby1x.png", "5/5b/0gfvhet9j89b766xv7mr3kypzvqiph1.png", "6/64/ofbt13fraa5fgwpt59ww9n23u4q8cl6.png", "6/60/g9xa7ymt7t6d46q2otd4ei04o7xez5n.png"],
				["7/71/3u1x11tfwgiu4zwj8rk2ggdgr7n7ve5.png", "8/84/b11dcdaams7kcara8r53dvnxz42cime.png", "b/bb/tnzm5hn4tqmzhiml4386yrl2yn104kr.png", "4/48/5zynswr8uyuxlgc5mdrzorbmjj9coju.png"],
				["c/cd/8495ui0wviex7f9euh9vhmb65f9exey.png", "3/30/rdipmqp6a85girfrnlx1bfumeqfj5ev.png", "6/6d/aiqzghjs2fwx3i71o8nrmu3su844nys.png", "5/57/mqoyuq7f3d2t8baq117gakz8ek7axxx.png"],
				["3/3e/m48ujwrazrd7zgokhkgvbmewjaccrpw.png", "6/6b/rv99bh5xrc77yg32ejlztn6xobzn2md.png", "0/06/tnk758yuo88400nttwczwb1j7lrg0h6.png", "5/5d/kwt1pmyddib56sugzyart6vbg7lhfow.png"],
				["6/66/a0hh16zou02b9nswx9ysadya9fxe4l5.png", "3/39/gdcz80tg6yk93og2mmdgd479qioaxsj.png", "5/5e/mhx1onozcb0xki5g444j3h0v1sbnf1p.png", "a/a8/074pmx9z7x7unb7k1ywz1dhka1em6mi.png"],
				["1/15/5z85ueg7jpc01o09nmv4svqwtklgr12.png", "1/12/mcnppr62mp9mg1pcbnpku2nt1v3ivf0.png", "3/36/p7gw8g13162ipbvd5p9sn6vmsxr2cyr.png", "a/af/i99ouf8oemw2ohenniv391ptclb38yg.png"],
				["a/a2/ibhnwict33qecuuk81nx8vyln9th7to.png", "a/a3/qsmxat8m1q7jhidyo2yvlsu9vgmgqd4.png", "8/8a/enorxt2qehfxoi06pupwn41gjxs7qet.png", "6/60/qda7cw5dm21qgq7oibtu2zz4prodhiu.png"],
				["4/47/pgc7yl7cwztetdpznu04z5n2p7t3izz.png", "f/fb/m4ioswd3z5naq0ih26ese8aq128z5b5.png", "2/23/7giwd610wqb38svsjxkzek7hu3ytf9p.png", "8/82/56sbmchyhp3maqljimfa3nudhyde7cb.png"],
				["0/0b/ceylopyy5smktvl3sbzxpuuh1z30fg3.png", "f/f2/hx2crv3nuwhjpnsyc1uh5ikzeu5l2kc.png", "b/b0/cnsfcehw76wnz51r36q49jp8hinuc8n.png", "e/ee/r9bvb6e3t2k7llk7h44ipibc0ln0140.png"],
				["2/2b/pmecf6g1jeq3dx7xrxdd6tp6sf9rm7l.png", "5/50/1p50la2vv9lrwtvofrq7mwm5hzs448v.png", "7/76/oan5ddell5tot762juw7ucda4fcl7yz.png", "a/a9/skdi6dh1cvn6d8bd9e4yo8r6af1tynq.png"],
				["1/12/gtt7gn0djn9tzrj2ka24cjjxzlzqfbw.png", "6/66/t4xs3hfk68tdx3ba7mpih4g0anon9fb.png", "a/a5/lzll07ijfzhoqipre9byrdaisldut4e.png", "e/e7/cuu700a8n0yu03nrc2479sczyclbf1a.png"],
			];

			const CARDS = [
				{ label: "SR-1", url: IMG + "c/c5/7072a9ghtfsg26d6wgg8jgjac4mz49r.png" },
				{ label: "SR-1+", url: IMG + "b/b5/8r1baeobac5tr87gybfl6zt1dtwvswb.png" },
				{ label: "SSR-1", url: IMG + "a/a5/nr5fryuedu3w49btxqttb3z8kgavi42.png" },
				{ label: "SSR-1+", url: IMG + "a/ae/lp2u2bb1iljjh32qtic2npkk5brlqu7.png" },
				{ label: "SR-2", url: IMG + "4/4e/q82bvl4fury5fim6yya43ke63nvsmnq.png" },
				{ label: "SR-2+", url: IMG + "5/50/tedj5q9xy4a64ftobrann36bojus3w5.png" },
				{ label: "SR-3", url: IMG + "8/8e/gtxk5xydrcme1e2ug7qestym18n5ey3.png" },
				{ label: "SR-3+", url: IMG + "7/75/f64m4thcc3hfdxuypgl8txe9gcj8m62.png" },
				{ label: "SSR-2", url: IMG + "c/c6/ktwwmvw60sw180idvl4l8qhxsbgdgk2.png" },
				{ label: "SSR-2+", url: IMG + "6/6d/2ehigxz87rmc8gmtxljn6hhpuaomest.png" },
				{ label: "SR-4", url: IMG + "e/ef/gxloy99frxca5hkfsfvf6jjqw7e32xo.png" },
				{ label: "SR-4+", url: IMG + "c/c9/f4d3qlwr1kd194854lvcqmagv70u4g6.png" },
				{ label: "SR-5", url: IMG + "d/da/ql99mtxys1osegpve1c1zgjnqty6efb.png" },
				{ label: "SR-5+", url: IMG + "f/f3/hlam5dw18vbmzc5qxfv7gghkd1sibog.png" },
				{ label: "SSR-3", url: IMG + "a/af/gk3iialzydgjjwpapuwdqoq9vgt1r5c.png" },
				{ label: "SSR-3+", url: IMG + "0/04/qe8d4t3df0jfzkp5ww3t6dum0uajgws.png" },
				{ label: "SSR-4", url: IMG + "d/d1/q2orsb6ygokz4hbfguwry3jmcskzsb2.png" },
				{ label: "SSR-4+", url: IMG + "6/68/md8xgmergzrtwy2ktq8ilkxpv0cv8zo.png" },
				{ label: "SR-6", url: IMG + "2/2a/f841ll2n4v3j4xgedp0m2z2pjsuv87w.png" },
				{ label: "SR-6+", url: IMG + "3/34/el5mgvr7bsxol4ke9257k2wpzsyej30.png" },
				{ label: "SR-7", url: IMG + "1/13/qusvh4juet41d8dsoiifeh5vyv1pqtq.png" },
				{ label: "SR-7+", url: IMG + "e/e7/hv19pr2cvglfywtza4xgqxqu6kygudx.png" },
				{ label: "SSR-5", url: IMG + "f/f6/3whyomkrysdjw7ajcglkui65ncllo94.png" },
				{ label: "SSR-5+", url: IMG + "4/40/9qylnl62pskrgo7hqfrrqi1pidi5qan.png" },
				{ label: "SR-8", url: IMG + "d/dc/sxv035hpv4egj4oh7dn3z8w309zwbra.png" },
				{ label: "SR-8+", url: IMG + "f/f5/dr6aew74alr71fhdpp4np809a2epujg.png" },
			];

			const MOBAMAS = [
				{ label: "R1 特训后", url: IMG + "2/2b/mcqzb1iou761wk7qbk8qq0nfulvtl4o.jpg" },
				{ label: "R2 特训后", url: IMG + "b/b1/nd50guac4fiqd9mm69tlqw5oa5e3jfs.jpg" },
				{ label: "R3 特训后", url: IMG + "f/fb/9bb0dvjfit32lcdj4c5upe62nslctkq.jpg" },
				{ label: "R4 特训后", url: IMG + "3/32/rsq9x4788bc5x25mxsatk371qjivdxa.jpg" },
				{ label: "R5 特训后", url: IMG + "a/a9/nxsit880o7ag7jg815famz9dtofo3pc.jpg" },
				{ label: "R6 特训后", url: IMG + "7/7e/ri3hrmpzhcw33sdborez1p99z3czu5d.jpg" },
				{ label: "R7 特训后", url: IMG + "e/ea/qonnfoovogy7lffn04vlukbennfmg8c.jpg" },
				{ label: "SR1 特训后", url: IMG + "4/41/ru4du0df7ko8hdjogiwyp3zofvo6snp.jpg" },
				{ label: "SR2 特训后", url: IMG + "a/a9/6i8sikn64rw9fwivd6m2sli9l9dyzf7.jpg" },
				{ label: "SR3 特训后", url: IMG + "8/88/pf2ul9wxfgjcgghl7ugknd9a7zzey7y.jpg" },
				{ label: "SR4 特训后", url: IMG + "7/71/4vug8mtsj85kjy88qfc2oltku9labpn.jpg" },
				{ label: "SR5 特训后", url: IMG + "4/4f/k3rs9eerv0fuvnhsamjal35h8spw3en.jpg" },
				{ label: "SR6 特训后", url: IMG + "0/09/a8qf15zz1zfhtpegi3cnu3w4uz71670.jpg" },
				{ label: "SR7 特训后", url: IMG + "6/62/bhjylqpma6rcbs0yunhehlpkim0sie2.jpg" },
				{ label: "SR9 特训后", url: IMG + "e/e9/4r01cq7hkcatq9zkvoncxyfuwwkd0hv.jpg" },
			];

			const LINES = ['。。。。。'];


			// BEGIN CHARACTER_DATA
			const ADDITIONAL_CHARACTERS = {
			  "arisu": {
			    "id": "arisu",
			    "name": "橘爱丽丝",
			    "search": "tachibana arisu 橘ありす",
			    "SIGN_URL": "https://patchwiki.biligame.com/images/imascg/d/dd/5x74l4kepgdrkjxw3joigbno851l2qx.png",
			    "ICONS": [
			      "5/56/6788m9d4xnav3yr5jy7xaoi46s0ws7g.png",
			      "4/41/0rz9ia10bfm5oqsbg93ukx75ch03wmm.png",
			      "4/45/czgdc0rldcyk44ah9bqm3nwmy8fak3w.png",
			      "c/ca/s8art7wj5nvwxgcsd97ywnblrc0jzcr.png",
			      "4/49/0s2es34jkjydd7e0dxgxz8vvaimrbkl.png",
			      "a/af/4nhctjzpv93ehh78uafvxeanxcdvmr4.png",
			      "7/71/7zd3cuihv94466u0fpl8e9hwhnolte4.png",
			      "1/17/j2ypuie7eaqzfdss2dvxt4xuj42v5mo.png",
			      "e/e4/67xxv548rp7ej1y0ffzaw9ffw6s7iga.png",
			      "d/de/1cooad15eg7sr80707sfgz2h94hhi2a.png",
			      "b/bc/5rqpeg8u2ixlrqt5ywn6v5d5yf42ly8.png",
			      "9/9b/ca7pr3kvio3sbpkjofhurxcjfdc54i2.png",
			      "e/ea/0eg14fut0k2ioxfkhdvdlqzo5m1vzia.png",
			      "b/b0/74rcjay94sgf3j4cq65nwt5b43nyb3g.png"
			    ],
			    "PETITS": [
			      [
			        "3/39/pid5z3wqqgdr0jscrse7pjyi4ynv6rh.png",
			        "8/89/clni55iyow3m5j7cro43tmzgxmrqi60.png",
			        "5/5a/8f0g0hsxn6m8tq8yz167iaoxh6f2j55.png",
			        "2/22/8yn5g9c0srf715sjqj7k2b71fg8zh76.png"
			      ],
			      [
			        "b/b2/khtvma9qg1jiidaghbvaxcydoopbhz7.png",
			        "2/26/9e1n5fmqci4wztscpqv1begyekj27zw.png",
			        "0/02/0evxrkj718y5b9ip3ormwnbo0d1mltq.png",
			        "2/2c/4741l47aldeexd8fxgixaiz0plqddg3.png"
			      ],
			      [
			        "1/12/n230s771pxs0rcylpo0yzbbd8jw3ysp.png",
			        "2/2d/tekrt5gmw18c0ojpzp3hv7rfju7hjct.png",
			        "c/cc/lcrhcqor6jmuk6w0x8nap37dryv4zw6.png",
			        "b/b4/avdi0fcm2j7dcgp11kwim5ouotbj3lg.png"
			      ],
			      [
			        "1/1b/58x6kgj1nmtnkqsavq4r6ik19wb6v33.png",
			        "d/d7/04dyn5j7uauim4mcuc5v0gid1blovur.png",
			        "7/76/3lsd559ff3eqxd8bdlv2zqicyi0iyhx.png",
			        "6/6d/8rt7ojqkmmqug5pmoomo8uy4r7etnbv.png"
			      ],
			      [
			        "6/6b/1mjkhpfevne0002f2s3acomv9h9zkw4.png",
			        "f/f9/mr9ofkgrzkent7mvgdlkhsois3atnky.png",
			        "c/c7/87k3waxsybuhlzr58f2qkzhyrtkj9ol.png",
			        "a/ae/snt9ruz7bof4q5ac7k5iq6rqrvhk22u.png"
			      ],
			      [
			        "b/b8/erztf657bb7ux0v3mrbb5t8hd9m4cyt.png",
			        "c/c2/iu0w2fhgwtpi66klzumznwprqq56j3n.png",
			        "6/60/pbtc01tf8lwy4ovlwue5im3580inkyy.png",
			        "c/c1/rri7pgb56i7icv5zahdvnzkz69um1xn.png"
			      ],
			      [
			        "3/3a/0emv8gcpcyi7wcy843zyqihkyr390d8.png",
			        "2/23/5nqtg3vauhqncsvlr90glzutt9mmsvj.png",
			        "e/e3/sx2e7iuda3dil0chdp6ktm7gwpy8xg9.png",
			        "0/06/9caxjw0adjba8tle8nvz1n6lbzwg2fw.png"
			      ],
			      [
			        "b/b8/ir6vkmfsp11zl4kl8haug4rxrs5spp6.png",
			        "d/d9/lyi6i0zllkdzteph9aah3vse0rbmq0a.png",
			        "d/db/ffm4fhf0r8z71ef7e17mvwyc5vujpvk.png",
			        "e/ef/q9tzj78o05s84e0f8smigzq18augqjb.png"
			      ],
			      [
			        "6/64/np59nbug0q30fxn4minaifrgczcee2b.png",
			        "b/ba/qzd81t38bqsocnxxf2jzehk26axpqpj.png",
			        "6/65/asfx9z9jhuuepz0ysn6hxbxwputb1y0.png",
			        "a/a2/637sgsm6d0j40wyojyjtggpdfusoa8o.png"
			      ],
			      [
			        "4/42/k1s10b9f4b0xpe5z9lexkg944b8qnhr.png",
			        "d/dd/1itd6xn01n7s5ydxqhdgbr7i4t3iwrh.png",
			        "c/ca/scvf6kz6yq4bw0ji7lv93mpxznhip7l.png",
			        "d/d1/8yvye2x5r2pngxqqtbh38nejpc5n505.png"
			      ],
			      [
			        "b/b7/lpt8fkk8zi95o93q5va4qlt07h5po2o.png",
			        "e/e1/4ahutis0jdhltby71snt4c9ykvo5rdm.png",
			        "2/2b/f3nn8rldvqk5mnjxu7vmfdlv86590db.png",
			        "4/42/p0iluzpd6bvwqeje0n47dts7v81rxgd.png"
			      ],
			      [
			        "6/62/4tb8x4x64liafqo1g27rkjc7pgghhw8.png",
			        "8/8b/eu40hrzxi0h0ylkh0btb17bjis4iz7f.png",
			        "a/af/0l7r3su5r5m0cich20gjjyddoujcv2u.png",
			        "a/a0/iq7hlt0j5glduxmg2a1cloai826ac4g.png"
			      ],
			      [
			        "c/cb/1j9jxpyf0n5ytosncoa6nr12wdfyz2l.png",
			        "a/a5/ez78a5h7imlle7p9ll8tq6gqejbwvs9.png",
			        "3/3f/f1urd6moekjy9c8m6jsvo2xu1bzy2c7.png",
			        "e/ed/k8c5kzgpz2s0l0u9qg7h3i8di72ptkc.png"
			      ],
			      [
			        "0/09/682shtyleyp3gzv03xya0d6rqitv4eh.png",
			        "6/6d/f00cfqcb01t4akldrqnw3vyp9j50fbf.png",
			        "f/f8/hvwzskqv5o90s3s439xkbt8ot0bnc38.png",
			        "c/c3/svu929x8sx23z88iytep3sq3ajq82s3.png"
			      ]
			    ],
			    "outfitIds": [
			      "1",
			      "2",
			      "3",
			      "4",
			      "5",
			      "6",
			      "7",
			      "8",
			      "9",
			      "10",
			      "11",
			      "12",
			      "13",
			      "14"
			    ],
			    "CARDS": [
			      {
			        "id": "CGSS-Arisu-SR-1.png",
			        "label": "SR-1",
			        "url": "https://patchwiki.biligame.com/images/imascg/6/6f/e4rwf1kiq7ogr3llesitx8g81iwjngy.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-1+.png",
			        "label": "SR-1+",
			        "url": "https://patchwiki.biligame.com/images/imascg/6/6d/1xd0ffsy3sa7a22soxx0fw2iefpo8mo.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-2.png",
			        "label": "SR-2",
			        "url": "https://patchwiki.biligame.com/images/imascg/6/6d/82h01mtah9w75u2nzorgyfxhrkrpp5c.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-2+.png",
			        "label": "SR-2+",
			        "url": "https://patchwiki.biligame.com/images/imascg/2/21/i7x1dw2h1fa5d8ovx4wlvcuzu3tv56x.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-3.png",
			        "label": "SR-3",
			        "url": "https://patchwiki.biligame.com/images/imascg/7/74/rzjhg5h7ivqb7znqyxcanwsc5fje5ae.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-3+.png",
			        "label": "SR-3+",
			        "url": "https://patchwiki.biligame.com/images/imascg/0/03/nj9kf7p96th9idmpd9v2shaat35y3hz.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-4.png",
			        "label": "SR-4",
			        "url": "https://patchwiki.biligame.com/images/imascg/3/39/86wky6kklp1oq6fnqtei51oznikaykv.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-4+.png",
			        "label": "SR-4+",
			        "url": "https://patchwiki.biligame.com/images/imascg/2/2f/r8ncb9pw55ew6t2sa1uhcgfltn72eu9.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-5.png",
			        "label": "SR-5",
			        "url": "https://patchwiki.biligame.com/images/imascg/1/18/bok057hqsjz8jbotpkecwgvye2eaell.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-5+.png",
			        "label": "SR-5+",
			        "url": "https://patchwiki.biligame.com/images/imascg/3/30/rlr5zs4zof17m0k39fi3ofif92gnl51.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-6.png",
			        "label": "SR-6",
			        "url": "https://patchwiki.biligame.com/images/imascg/1/14/5cx71p8oi7peub9ogbsy4gx6hvitqbw.png"
			      },
			      {
			        "id": "CGSS-Arisu-SR-6+.png",
			        "label": "SR-6+",
			        "url": "https://patchwiki.biligame.com/images/imascg/4/40/5d13jh0dcnua3iy5xv1kv4la3k6wjzc.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-1.png",
			        "label": "SSR-1",
			        "url": "https://patchwiki.biligame.com/images/imascg/0/05/esxtg172aega34338qjgsrmzhnlv04k.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-1+.png",
			        "label": "SSR-1+",
			        "url": "https://patchwiki.biligame.com/images/imascg/7/75/h16zba33b9vbrvxojew7gp66q0svkag.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-2.png",
			        "label": "SSR-2",
			        "url": "https://patchwiki.biligame.com/images/imascg/f/f6/t1votkhdq28rhn8zkjh8uws5y9g7zqv.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-2+.png",
			        "label": "SSR-2+",
			        "url": "https://patchwiki.biligame.com/images/imascg/6/61/5wno5akizyvp2hjqpqkjsy5b7ao14pb.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-3.png",
			        "label": "SSR-3",
			        "url": "https://patchwiki.biligame.com/images/imascg/f/fb/ogmyrbu1md22pnh7c2eijx6s1vfvw0u.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-3+.png",
			        "label": "SSR-3+",
			        "url": "https://patchwiki.biligame.com/images/imascg/7/7d/d9ct1n5xn2fk52rsssq2gi111cpsefv.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-4.png",
			        "label": "SSR-4",
			        "url": "https://patchwiki.biligame.com/images/imascg/2/29/rxpxz1i4oputv4srz9oqwz9ke4833pm.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-4+.png",
			        "label": "SSR-4+",
			        "url": "https://patchwiki.biligame.com/images/imascg/0/01/ltfc36rr1ovlsh3k086g8qmoepxgy3g.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-5.png",
			        "label": "SSR-5",
			        "url": "https://patchwiki.biligame.com/images/imascg/c/cc/fpds8nxhkrwc2wewyjv10gx8zlyigsb.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-5+.png",
			        "label": "SSR-5+",
			        "url": "https://patchwiki.biligame.com/images/imascg/3/34/hr3ku0ozo7tvg4b8uw8o99qkyue2y5z.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-6.png",
			        "label": "SSR-6",
			        "url": "https://patchwiki.biligame.com/images/imascg/4/43/pxsnvcvq5t68hlls9f4j7xk4lgmidfd.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-6+.png",
			        "label": "SSR-6+",
			        "url": "https://patchwiki.biligame.com/images/imascg/3/34/3d0b1mru9u3br5qkqe9m6af9b95ck3d.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-7.png",
			        "label": "SSR-7",
			        "url": "https://patchwiki.biligame.com/images/imascg/7/7b/qyoxgvvtojjhzgbmqb6t73g2pv8srsx.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-7+.png",
			        "label": "SSR-7+",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/df/m58uyn8g8zjlulf12vizblo135531vi.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-8.png",
			        "label": "SSR-8",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/d4/iydfvyavpladsfgbndhjpcgop7k85cq.png"
			      },
			      {
			        "id": "CGSS-Arisu-SSR-8+.png",
			        "label": "SSR-8+",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/df/s17w49xzghghca02278kyx0n0sflqhr.png"
			      }
			    ],
			    "MOBAMAS": [
			      {
			        "label": "N-1+",
			        "url": "https://patchwiki.biligame.com/images/imascg/5/59/j64feoz19cmv40fns7ype6crg879xq3.jpg"
			      },
			      {
			        "label": "R-1+",
			        "url": "https://patchwiki.biligame.com/images/imascg/5/53/gbyks48v0i840qnna9uzfm0nlovqe1e.jpg"
			      },
			      {
			        "label": "R-2+",
			        "url": "https://patchwiki.biligame.com/images/imascg/b/bb/l13p666fvcqyk6itzuh5zmqwstev9sl.jpg"
			      },
			      {
			        "label": "R-3+",
			        "url": "https://patchwiki.biligame.com/images/imascg/5/56/17mgq3hfuya4rwq9a266352nnj9dzxf.jpg"
			      },
			      {
			        "label": "SR-1+",
			        "url": "https://patchwiki.biligame.com/images/imascg/1/11/1wyjc0s2z69pa6ip1mgubywg3fyb743.jpg"
			      },
			      {
			        "label": "SR-2+",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/d4/7xpaetskbeyiv6miqb4tvq4213jk72n.jpg"
			      },
			      {
			        "label": "SR-3+",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/d2/mp8zx5j2753gskzmbanfepibq8ywtpi.jpg"
			      },
			      {
			        "label": "SR-4+",
			        "url": "https://patchwiki.biligame.com/images/imascg/5/58/5rcxjrijtyr9lbyept5kmh97smsll8x.jpg"
			      },
			      {
			        "label": "SR-5+",
			        "url": "https://patchwiki.biligame.com/images/imascg/d/d1/1e8fdpmx52b3tf42o9tfd82k9hckan2.jpg"
			      },
			      {
			        "label": "SR-6+",
			        "url": "https://patchwiki.biligame.com/images/imascg/1/1f/t9wf3uwwvavywpiqf2cztieaxpp62h3.jpg"
			      },
			      {
			        "label": "SR-7+",
			        "url": "https://patchwiki.biligame.com/images/imascg/6/6c/g22u7emdypzlo0suqo2kct2ush9430g.jpg"
			      },
			      {
			        "label": "SR-8+",
			        "url": "https://patchwiki.biligame.com/images/imascg/9/93/ldrnrd5aglz8fqemps3o3ptamve6930.jpg"
			      },
			      {
			        "label": "SR-9+",
			        "url": "https://patchwiki.biligame.com/images/imascg/4/42/1akuo5r1d8nzilu0u5ea1qo518dpc87.jpg"
			      },
			      {
			        "label": "SR-10+",
			        "url": "https://patchwiki.biligame.com/images/imascg/3/3f/cawx86q6jis3cbfmdcujosjbht6ed75.jpg"
			      },
			      {
			        "label": "SR-11+",
			        "url": "https://patchwiki.biligame.com/images/imascg/8/82/86cdoribpy8ek0x6t1qkz69hddushsm.jpg"
			      },
			      {
			        "label": "SR-12+",
			        "url": "https://patchwiki.biligame.com/images/imascg/f/f4/kcgz6u5jgmaf3gqbwiuqpte61mg72jf.jpg"
			      },
			      {
			        "label": "SR-13+",
			        "url": "https://patchwiki.biligame.com/images/imascg/c/c7/98hoo7lg37m2a65vpaiqoy081o7uglu.jpg"
			      },
			      {
			        "label": "SR-14+",
			        "url": "https://patchwiki.biligame.com/images/imascg/e/e7/3y0cm3pr7chs1mbt717lonmrx13myiu.jpg"
			      },
			      {
			        "label": "SR-15+",
			        "url": "https://patchwiki.biligame.com/images/imascg/9/97/aixpnx0xrc065j1vlmkhy2djcgwit60.jpg"
			      },
			      {
			        "label": "SR-16+",
			        "url": "https://patchwiki.biligame.com/images/imascg/0/0c/2oijqzgp9g8zdezles4jjqbwk165wpf.jpg"
			      },
			      {
			        "label": "SR-17+",
			        "url": "https://patchwiki.biligame.com/images/imascg/1/15/mqr8fohzhi65ecl0y7o1nnbg6fyk7ht.jpg"
			      }
			    ],
			    "defaults": {
			      "cardIndex": 0,
			      "petitIndex": 0,
			      "bg": "https://patchwiki.biligame.com/images/imascg/6/6f/e4rwf1kiq7ogr3llesitx8g81iwjngy.png"
			    }
			  }
			};
			// END CHARACTER_DATA

			const PLACEHOLDER = '。。。。。';
			const CHARACTERS = Object.freeze({
			  yukimi: { id: 'yukimi', name: '佐城雪美', search: 'sajo yukimi 佐城雪美', IMG, ICONS, PETITS, CARDS, MOBAMAS, SIGN_URL,
			    outfitIds: PETITS.map((_, index) => String(index + 1)), defaults: { cardIndex: 7, petitIndex: 0, bg: CARDS[23].url } },
			  ...Object.fromEntries(Object.entries(ADDITIONAL_CHARACTERS).map(([id, character]) => [id, { ...character, IMG }])),
			});
			const CHARACTER_LIST = Object.freeze(Object.values(CHARACTERS).map(({ id, name, search }) => ({ id, name, search })));
			const getCharacter = id => CHARACTERS[Object.hasOwn(CHARACTERS, id) ? id : 'yukimi'];
			const DEFAULT_APPEARANCE = Object.freeze({ characterId: 'yukimi', ...CHARACTERS.yukimi.defaults, showSign: true, showMobamas: false });

			// A character switch is one transaction. Never combine one idol's indices with another's background.
			function normalizeAppearance(input, previous = DEFAULT_APPEARANCE) {
			  const before = { ...DEFAULT_APPEARANCE, ...previous };
			  if (!input || typeof input !== 'object' || Array.isArray(input)) return before;
			  if (Object.hasOwn(input, 'characterId') && !Object.hasOwn(CHARACTERS, input.characterId)) return before;
			  const characterId = input.characterId ?? before.characterId;
			  const character = getCharacter(characterId);
			  const result = { ...before, ...(characterId !== before.characterId ? character.defaults : {}), characterId };
			  if (Number.isInteger(input.cardIndex) && input.cardIndex >= 0 && input.cardIndex < character.PETITS.length) {
			    if (input.cardIndex !== result.cardIndex) result.petitIndex = 0;
			    result.cardIndex = input.cardIndex;
			  }
			  if (Number.isInteger(input.petitIndex) && input.petitIndex >= 0 && input.petitIndex < character.PETITS[result.cardIndex].length) result.petitIndex = input.petitIndex;
			  if (character.CARDS.some(card => card.url === input.bg)) result.bg = input.bg;
			  for (const key of ['showSign', 'showMobamas']) if (typeof input[key] === 'boolean') result[key] = input[key];
			  return result;
			}

			function appearancePatch(input, previous = DEFAULT_APPEARANCE) {
			  const result = normalizeAppearance(input, previous);
			  const switched = result.characterId !== (previous.characterId ?? 'yukimi');
			  return Object.fromEntries(Object.keys(DEFAULT_APPEARANCE).filter(key => switched || result[key] !== previous[key]).map(key => [key, result[key]]));
			}
			function spriteUrl(preferences) {
			  const character = getCharacter(preferences.characterId);
			  return character.IMG + character.PETITS[preferences.cardIndex][preferences.petitIndex];
			}
			// Disk uses stable outfit/background identifiers; legacy index-only preferences still migrate.
			function savedAppearance(preferences) {
			  const character = getCharacter(preferences.characterId);
			  return { ...preferences, outfitId: character.outfitIds[preferences.cardIndex], poseId: String(preferences.petitIndex + 1), backgroundId: character.CARDS.find(card => card.url === preferences.bg)?.id ?? preferences.bg };
			}
			function restoreAppearance(saved) {
			  const result = normalizeAppearance(saved);
			  const character = getCharacter(result.characterId);
			  const outfit = character.outfitIds.indexOf(saved?.outfitId);
			  const background = character.CARDS.find(card => (card.id ?? card.url) === saved?.backgroundId);
			  return normalizeAppearance({ ...(saved?.outfitId !== undefined ? { cardIndex: outfit >= 0 ? outfit : character.defaults.cardIndex, petitIndex: outfit >= 0 ? Number(saved.poseId) - 1 : 0 } : {}), ...(saved?.backgroundId !== undefined ? { bg: background?.url ?? character.defaults.bg } : {}) }, result);
			}
			function allowedImageUrls() {
			  return new Set(Object.values(CHARACTERS).flatMap(character => [character.SIGN_URL, ...character.ICONS.map(file => character.IMG + file), ...character.PETITS.flat().map(file => character.IMG + file), ...character.CARDS.map(card => card.url), ...character.MOBAMAS.map(card => card.url)]).filter(Boolean));
			}
			// END YUKIMI_ASSETS

			function MobamasRail({ characterId }) {
				const { MOBAMAS } = getCharacter(characterId);
				const [index, setIndex] = React.useState(0);
				const [pos, setPos] = React.useState({ right: 20, top: 120 });
				const dragRef = React.useRef(null);

				React.useEffect(() => {
					return ctx.interval(() => setIndex(i => (i + 1) % MOBAMAS.length), 3200);
				}, [index, characterId]);

				const onDown = (e) => {
					dragRef.current = { sx: e.clientX, sy: e.clientY, rr: pos.right, tt: pos.top };
					if (e.currentTarget && e.currentTarget.setPointerCapture) {
						e.currentTarget.setPointerCapture(e.pointerId);
					}
				};
				const onMove = (e) => {
					const d = dragRef.current;
					if (!d) return;
					const bounds = e.currentTarget.parentElement.getBoundingClientRect();
					setPos({ right: Math.max(0, Math.min(window.innerWidth - bounds.width, d.rr - (e.clientX - d.sx))), top: Math.max(0, Math.min(window.innerHeight - bounds.height, d.tt + (e.clientY - d.sy))) });
				};
				const onUp = () => { dragRef.current = null; };

				const card = MOBAMAS[index % MOBAMAS.length];
				const rootStyle = { position: "fixed", right: pos.right, top: pos.top, width: "clamp(140px, 13vw, 196px)", pointerEvents: "auto", zIndex: 2, fontFamily: "inherit" };

				return React.createElement("div", { className: "yukimi-mobamas", style: rootStyle },
					React.createElement("div", {
						onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp,
						style: { cursor: "move", userSelect: "none", background: "#171C8F", color: "#fff", padding: "6px 10px", borderRadius: "12px 12px 0 0", fontSize: 12, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" },
					},
						React.createElement("span", null, "Mobamas 卡片"),
						React.createElement("span", { style: { opacity: 0.75, fontSize: 11, fontWeight: 400 } }, (index + 1) + "/" + MOBAMAS.length),
					),
					React.createElement("button", {
						onClick: () => setIndex((index + 1) % MOBAMAS.length),
						title: "点击跳到下一个",
						style: { cursor: "pointer", padding: 0, border: "none", background: "#eef1f8", display: "block", lineHeight: 0, width: "100%" },
					},
						React.createElement("img", { src: card.url, alt: card.label, style: { width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block" } }),
					),
					React.createElement("div", { style: { textAlign: "center", padding: "5px 8px", background: "rgba(255,255,255,0.92)", borderRadius: "0 0 12px 12px", fontSize: 11, color: "#5c6b8e" } }, card.label),
				);
			}


			const wideScreen = window.matchMedia("(min-width: 1100px) and (min-height: 640px)");
			let preferences = { compact: !wideScreen.matches, desktopActive: false, ...DEFAULT_APPEARANCE };
			const listeners = new Set();
			const source = {
				getSnapshot: () => preferences,
				subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
			};
			const sanitizePreferences = patch => appearancePatch(patch, preferences);
			const setLocal = patch => {
				if (!Object.keys(patch).some(key => preferences[key] !== patch[key])) return;
				preferences = { ...preferences, ...patch };
				listeners.forEach(fn => fn());
			};
			let sendPreferences = () => {};
			const update = patch => {
				const clean = sanitizePreferences(patch);
				if (!Object.keys(clean).length) return;
				setLocal(clean);
				sendPreferences(clean);
			};
			ctx.effect(() => {
				const change = () => setLocal({ compact: !wideScreen.matches });
				wideScreen.addEventListener("change", change);
				return () => wideScreen.removeEventListener("change", change);
			});
			const slotInput = () => ({ hooks: { preferences: source }, update });
			ctx.effect(() => {
				const connection = ctx.get("connection");
				if (typeof connection?.rpc?.call !== "function") return;
				const lifetime = new AbortController();
				let alive = true;
				let polling = false;
				let pendingPreferences = {};
				let lastOpenedRequestId = null;
				const call = async (endpoint, payload) => {
					const request = new AbortController();
					const abort = () => request.abort();
					lifetime.signal.addEventListener("abort", abort, { once: true });
					if (lifetime.signal.aborted) abort();
					const cancelTimeout = ctx.timeout(abort, 4000);
					try {
						const result = await connection.rpc.call("/yukimi", endpoint, payload, request.signal);
						if (!result?.ok) throw new Error("Yukimi desktop bridge unavailable");
						return result.value;
					} finally {
						cancelTimeout();
						lifetime.signal.removeEventListener("abort", abort);
					}
				};
				const poll = async () => {
					if (!alive || polling) return;
					polling = true;
					try {
						if (Object.keys(pendingPreferences).length) {
							const patch = pendingPreferences;
							pendingPreferences = {};
							try {
								const saved = await call("preferences", patch);
								if (!alive) return;
								setLocal({ ...sanitizePreferences(saved), ...pendingPreferences });
							} catch (error) {
								pendingPreferences = { ...patch, ...pendingPreferences };
								throw error;
							}
						}
						const state = await call("state", {});
						if (!alive) return;
						if (typeof state?.active !== "boolean") throw new Error("Invalid Yukimi desktop state");
						setLocal({ ...sanitizePreferences(state.preferences), ...pendingPreferences, desktopActive: state.active });
						const navigation = state.navigation;
						if (typeof navigation?.requestId !== "string" || typeof navigation?.sessionId !== "string") return;
						if (lastOpenedRequestId !== navigation.requestId) {
							const workspace = ctx.get("uiWorkspace");
							if (typeof workspace?.openSession !== "function") return;
							await workspace.openSession(navigation.sessionId);
							if (!alive) return;
							lastOpenedRequestId = navigation.requestId;
						}
						await call("ack-navigation", { requestId: navigation.requestId });
					} catch {
						// A stopped helper or older web Host restores the original in-page pet.
						if (alive) setLocal({ desktopActive: false });
					} finally {
						polling = false;
					}
				};
				sendPreferences = patch => { pendingPreferences = { ...pendingPreferences, ...patch }; void poll(); };
				const stopPolling = ctx.interval(poll, 1000);
				void poll();
				return () => {
					alive = false;
					sendPreferences = () => {};
					stopPolling();
					lifetime.abort();
					setLocal({ desktopActive: false });
				};
			});

			function SignOverlay({ show, characterId }) {
				const character = getCharacter(characterId);
				if (!show) return null;
				return React.createElement("img", {
					className: "yukimi-sign", src: character.SIGN_URL, alt: character.name + " 签名",
					style: { position: "fixed", right: 18, bottom: 14, width: 160, pointerEvents: "none", userSelect: "none", opacity: 0.9, zIndex: 2, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" },
				});
			}

			function MobamasOverlay({ show, characterId }) {
				if (!show || !getCharacter(characterId).MOBAMAS.length) return null;
				return React.createElement(MobamasRail, { characterId });
			}

			function YukimiPet({ prefs, update }) {
				const character = getCharacter(prefs.characterId);
				const { ICONS, PETITS, CARDS } = character;
				const [characterSearch, setCharacterSearch] = React.useState("");
				const cardIndex = prefs.cardIndex;
				const petitIndex = prefs.petitIndex;
				const setCardIndex = value => update({ cardIndex: typeof value === "function" ? value(source.getSnapshot().cardIndex) : value });
				const setPetitIndex = value => update({ petitIndex: typeof value === "function" ? value(source.getSnapshot().petitIndex) : value });
				const [flipping, setFlipping] = React.useState(false);
				const [bubble, setBubble] = React.useState("");
				const bg = prefs.bg;
				const setBg = value => update({ bg: value });
				const [panelOpen, setPanelOpen] = React.useState(false);
				const [pos, setPos] = React.useState({ right: 16, bottom: 160 });
				const showSign = prefs.showSign;
				const showMobamas = prefs.showMobamas;
				const bubbleTimer = React.useRef(null);
				const pressTimer = React.useRef(null);
				const clickTimer = React.useRef(null);
				const panelTimer = React.useRef(null);
				const longPressTriggered = React.useRef(false);
				const dragging = React.useRef(false);
				const dragStart = React.useRef(null);
				const flippingRef = React.useRef(false);
				const flipTimers = React.useRef(new Set());
				const lastActiveRef = React.useRef(Date.now());
				const nextAutoRef = React.useRef(Date.now() + (60 + Math.random() * 540) * 1000);
				const scheduleFlip = (fn, delay) => {
					let cancel;
					cancel = ctx.timeout(() => { flipTimers.current.delete(cancel); fn(); }, delay);
					flipTimers.current.add(cancel);
				};
				React.useEffect(() => () => {
					for (const timer of [bubbleTimer, pressTimer, clickTimer, panelTimer]) {
						if (timer.current) timer.current();
						timer.current = null;
					}
					flipTimers.current.forEach(cancel => cancel());
					flipTimers.current.clear();
				}, [prefs.characterId]);
				React.useEffect(() => { flippingRef.current = false; setFlipping(false); setBubble(""); }, [prefs.characterId]);

				React.useEffect(() => {
					const clamp = () => {
						const size = Math.max(120, Math.min(220, window.innerWidth * .18));
						setPos(p => ({ right: Math.max(0, Math.min(p.right, window.innerWidth - size)), bottom: Math.max(0, Math.min(p.bottom, window.innerHeight - size)) }));
					};
					window.addEventListener("resize", clamp);
					clamp();
					return () => window.removeEventListener("resize", clamp);
				}, []);

				const doFlip = () => {
					if (flippingRef.current) return;
					flippingRef.current = true;
					setFlipping(true);
					scheduleFlip(() => setPetitIndex(i => (i + 1) % PETITS[cardIndex].length), 250);
					scheduleFlip(() => { flippingRef.current = false; setFlipping(false); }, 540);
					if (bubbleTimer.current) bubbleTimer.current();
					setBubble(LINES[Math.floor(Math.random() * LINES.length)]);
					bubbleTimer.current = ctx.timeout(() => { setBubble(""); bubbleTimer.current = null; }, 3200);
				};

				const doChangeOutfit = () => {
					if (flippingRef.current) return;
					flippingRef.current = true;
					setFlipping(true);
					scheduleFlip(() => {
						setCardIndex(i => (i + 1) % ICONS.length);
						setPetitIndex(0);
					}, 250);
					scheduleFlip(() => { flippingRef.current = false; setFlipping(false); }, 540);
				};

				const doFlipRef = React.useRef(doFlip);
				doFlipRef.current = doFlip;

				const resetPanelTimer = () => {
					if (panelTimer.current) panelTimer.current();
					panelTimer.current = ctx.timeout(() => { setPanelOpen(false); panelTimer.current = null; }, 6000);
				};

				const togglePanel = () => {
					setPanelOpen(o => {
						const next = !o;
						if (panelTimer.current) { panelTimer.current(); panelTimer.current = null; }
						if (next) {
							panelTimer.current = ctx.timeout(() => { setPanelOpen(false); panelTimer.current = null; }, 6000);
						}
						return next;
					});
				};

				React.useEffect(() => {
					const mark = () => { lastActiveRef.current = Date.now(); };
					window.addEventListener("pointerdown", mark);
					window.addEventListener("keydown", mark);
					window.addEventListener("mousemove", mark);
					return () => {
						window.removeEventListener("pointerdown", mark);
						window.removeEventListener("keydown", mark);
						window.removeEventListener("mousemove", mark);
					};
				}, []);

				React.useEffect(() => {
					return ctx.interval(() => {
						const now = Date.now();
						if ((now - lastActiveRef.current) < 30000 && now >= nextAutoRef.current) {
							doFlipRef.current();
							nextAutoRef.current = now + (60 + Math.random() * 540) * 1000;
						}
					}, 5000);
				}, []);

				const onPetitPointerDown = (e) => {
					if (e.currentTarget && e.currentTarget.setPointerCapture) {
						e.currentTarget.setPointerCapture(e.pointerId);
					}
					dragStart.current = { sx: e.clientX, sy: e.clientY, br: pos.right, bb: pos.bottom };
					dragging.current = false;
					longPressTriggered.current = false;
					if (pressTimer.current) pressTimer.current();
					pressTimer.current = ctx.timeout(() => {
						longPressTriggered.current = true;
						togglePanel();
					}, 500);
				};

				const onPetitPointerMove = (e) => {
					const d = dragStart.current;
					if (!d) return;
					const dx = e.clientX - d.sx;
					const dy = e.clientY - d.sy;
					if (!dragging.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
						dragging.current = true;
						if (pressTimer.current) { pressTimer.current(); pressTimer.current = null; }
						longPressTriggered.current = false;
					}
					if (dragging.current) {
						const size = e.currentTarget.getBoundingClientRect().width;
						setPos({ right: Math.max(0, Math.min(window.innerWidth - size, d.br - dx)), bottom: Math.max(0, Math.min(window.innerHeight - size, d.bb - dy)) });
					}
				};

				const onPetitPointerUp = (e) => {
					if (pressTimer.current) { pressTimer.current(); pressTimer.current = null; }
					const wasDragging = dragging.current;
					dragging.current = false;
					const d = dragStart.current;
					dragStart.current = null;
					if (wasDragging && d) {
						const dist = Math.sqrt(Math.pow(e.clientX - d.sx, 2) + Math.pow(e.clientY - d.sy, 2));
						if (dist >= 20) return;
						setPos({ right: d.br, bottom: d.bb });
					}
					if (longPressTriggered.current) return;
					if (clickTimer.current) {
						clickTimer.current();
						clickTimer.current = null;
						doChangeOutfit();
					} else {
						clickTimer.current = ctx.timeout(() => {
							clickTimer.current = null;
							doFlip();
						}, 280);
					}
				};

				const onPetitPointerCancel = () => {
					if (pressTimer.current) { pressTimer.current(); pressTimer.current = null; }
					if (clickTimer.current) { clickTimer.current(); clickTimer.current = null; }
					dragging.current = false;
					dragStart.current = null;
				};

				// Keep the picker beside its pet; flip sides and clamp at viewport edges.
				const petSize = Math.max(120, Math.min(220, window.innerWidth * .18));
				const panelWidth = Math.min(300, window.innerWidth - 24);
				const petLeft = window.innerWidth - pos.right - petSize;
				const preferredLeft = petLeft >= panelWidth + 20 ? petLeft - panelWidth - 8 : petLeft + petSize + 8;
				const panelLeft = Math.max(12, Math.min(preferredLeft, window.innerWidth - panelWidth - 12));
				const panelBottom = Math.max(12, Math.min(pos.bottom, window.innerHeight - Math.min(460, window.innerHeight - 24) - 12));

				const rootStyle = { position: "fixed", right: pos.right, bottom: pos.bottom, zIndex: 2, pointerEvents: "auto", fontFamily: "inherit" };

				return React.createElement("div", { className: "yukimi-pet", style: rootStyle },
					React.createElement("div", { style: { position: "relative", width: "var(--yukimi-pet-size)" } },
						React.createElement("img", {
							src: IMG + PETITS[cardIndex][petitIndex], alt: character.name + " 纸片小人",
							role: "button", tabIndex: 0, "aria-label": "与" + character.name + "互动",
							onKeyDown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doFlip(); } if (e.key === "Escape") setPanelOpen(false); if (e.key === "ContextMenu") { e.preventDefault(); togglePanel(); } },
							draggable: false,
							onDragStart: (e) => e.preventDefault(),
							onPointerDown: onPetitPointerDown, onPointerMove: onPetitPointerMove, onPointerUp: onPetitPointerUp, onPointerCancel: onPetitPointerCancel,
							style: { width: "var(--yukimi-pet-size)", aspectRatio: "1 / 1", objectFit: "contain", cursor: "pointer", userSelect: "none", touchAction: "none", WebkitUserDrag: "none", animation: flipping ? "yukimi-flip 0.5s ease" : "yukimi-idle 2.4s ease-in-out infinite", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" },
						}),
						bubble ? React.createElement("div", { style: { position: "absolute", right: -6, top: -8, maxWidth: 200, background: "rgba(23,28,63,0.85)", color: "#fff", padding: "8px 10px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, pointerEvents: "none" } }, bubble) : null,
						panelOpen ? React.createElement("div", {
							className: "yukimi-pet-panel", onPointerDown: resetPanelTimer,
							style: { position: "fixed", left: panelLeft, bottom: panelBottom, width: "min(300px, calc(100vw - 24px))", maxHeight: "min(460px, calc(100dvh - 24px))", overflowY: "auto", background: "rgba(255,255,255,0.95)", borderRadius: 12, boxShadow: "0 8px 30px rgba(20,24,60,0.35)", padding: 10 },
						},
							React.createElement("input", { type: "search", "aria-label": "搜索偶像", placeholder: "名字 / 罗马字", value: characterSearch, onChange: e => setCharacterSearch(e.target.value), style: { width: "100%", boxSizing: "border-box", marginBottom: 6 } }),
							React.createElement("select", { "aria-label": "选择偶像", value: prefs.characterId, onChange: e => { update({ characterId: e.target.value }); resetPanelTimer(); }, style: { width: "100%", marginBottom: 10 } },
								CHARACTER_LIST.filter(c => c.id === prefs.characterId || (c.name + " " + c.search).toLowerCase().includes(characterSearch.trim().toLowerCase())).map(c => React.createElement("option", { key: c.id, value: c.id }, c.name))),
							React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#5c6b8e", marginBottom: 6 } }, "显示"),
							React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } },
								React.createElement("button", {
									onClick: () => update({ showSign: !showSign }),
									style: { cursor: "pointer", border: "1px solid #2582C8", background: showSign ? "#171C8F" : "transparent", color: showSign ? "#fff" : "#171C8F", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 },
								}, "签名 " + (showSign ? "开" : "关")),
								React.createElement("button", {
									onClick: () => update({ showMobamas: !showMobamas }),
									style: { cursor: "pointer", border: "1px solid #2582C8", background: showMobamas ? "#171C8F" : "transparent", color: showMobamas ? "#fff" : "#171C8F", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 },
								}, "Mobamas " + (showMobamas ? "开" : "关")),
							),
							React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#5c6b8e", marginBottom: 6 } }, "小人"),
							React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 10 } },
								ICONS.map((ic, i) => React.createElement("button", {
									key: ic, onClick: () => { setCardIndex(i); setPetitIndex(0); }, title: "小人 " + (i + 1),
									style: { cursor: "pointer", padding: 0, border: cardIndex === i ? "2px solid #171C8F" : "2px solid transparent", borderRadius: 6, overflow: "hidden", background: "#eef1f8", display: "block", lineHeight: 0 },
								},
									React.createElement("img", { src: IMG + ic, alt: "小人 " + (i + 1), loading: "lazy", style: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" } }),
								)),
							),
							React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#5c6b8e", marginBottom: 6 } }, "背景"),
							React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 } },
								CARDS.map((c) => React.createElement("button", {
									key: c.url, onClick: () => setBg(c.url), title: c.label,
									style: { cursor: "pointer", padding: 0, border: bg === c.url ? "2px solid #171C8F" : "2px solid transparent", borderRadius: 6, overflow: "hidden", background: "#eef1f8", display: "block", lineHeight: 0 },
								},
									React.createElement("img", { src: c.url, alt: c.label, loading: "lazy", style: { width: "100%", aspectRatio: "1280 / 824", objectFit: "cover", display: "block" } }),
								)),
							),
						) : null,
					),
				);
			}


			function FloatingDecorations({ usePreferences, update }) {
				const prefs = usePreferences(p => p);
				return React.createElement(React.Fragment, null,
					React.createElement(SignOverlay, { show: !prefs.compact && prefs.showSign, characterId: prefs.characterId }),
					prefs.desktopActive ? null : React.createElement(YukimiPet, { prefs, update }),
					React.createElement(MobamasOverlay, { show: !prefs.compact && prefs.showMobamas, characterId: prefs.characterId }),
					React.createElement("style", null, ":root{--yukimi-bg:url(\"" + prefs.bg + "\");}"));
			}
			const slots = ctx.get("slots");
			slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "yukimi-decorations", order: 90, inject: slotInput }, FloatingDecorations));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
