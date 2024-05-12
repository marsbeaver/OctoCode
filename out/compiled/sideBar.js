var app = (function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	// Adapted from https://github.com/then/is-promise/blob/master/index.js
	// Distributed under MIT License https://github.com/then/is-promise/blob/master/LICENSE
	/**
	 * @param {any} value
	 * @returns {value is PromiseLike<any>}
	 */
	function is_promise(value) {
		return (
			!!value &&
			(typeof value === 'object' || typeof value === 'function') &&
			typeof (/** @type {any} */ (value).then) === 'function'
		);
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @param {Text} text
	 * @param {unknown} data
	 * @returns {void}
	 */
	function set_data(text, data) {
		data = '' + data;
		if (text.data === data) return;
		text.data = /** @type {string} */ (data);
	}

	/**
	 * @returns {void} */
	function set_input_value(input, value) {
		input.value = value == null ? '' : value;
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error('Function called outside component initialization');
		return current_component;
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	const outroing = new Set();

	/**
	 * @type {Outro}
	 */
	let outros;

	/**
	 * @returns {void} */
	function group_outros() {
		outros = {
			r: 0,
			c: [],
			p: outros // parent group
		};
	}

	/**
	 * @returns {void} */
	function check_outros() {
		if (!outros.r) {
			run_all(outros.c);
		}
		outros = outros.p;
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} local
	 * @param {0 | 1} [detach]
	 * @param {() => void} [callback]
	 * @returns {void}
	 */
	function transition_out(block, local, detach, callback) {
		if (block && block.o) {
			if (outroing.has(block)) return;
			outroing.add(block);
			outros.c.push(() => {
				outroing.delete(block);
				if (callback) {
					block.d(1);
					callback();
				}
			});
			block.o(local);
		} else if (callback) {
			callback();
		}
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	/**
	 * @template T
	 * @param {Promise<T>} promise
	 * @param {import('./private.js').PromiseInfo<T>} info
	 * @returns {boolean}
	 */
	function handle_promise(promise, info) {
		const token = (info.token = {});
		/**
		 * @param {import('./private.js').FragmentFactory} type
		 * @param {0 | 1 | 2} index
		 * @param {number} [key]
		 * @param {any} [value]
		 * @returns {void}
		 */
		function update(type, index, key, value) {
			if (info.token !== token) return;
			info.resolved = value;
			let child_ctx = info.ctx;
			if (key !== undefined) {
				child_ctx = child_ctx.slice();
				child_ctx[key] = value;
			}
			const block = type && (info.current = type)(child_ctx);
			let needs_flush = false;
			if (info.block) {
				if (info.blocks) {
					info.blocks.forEach((block, i) => {
						if (i !== index && block) {
							group_outros();
							transition_out(block, 1, 1, () => {
								if (info.blocks[i] === block) {
									info.blocks[i] = null;
								}
							});
							check_outros();
						}
					});
				} else {
					info.block.d(1);
				}
				block.c();
				transition_in(block, 1);
				block.m(info.mount(), info.anchor);
				needs_flush = true;
			}
			info.block = block;
			if (info.blocks) info.blocks[index] = block;
			if (needs_flush) {
				flush();
			}
		}
		if (is_promise(promise)) {
			const current_component = get_current_component();
			promise.then(
				(value) => {
					set_current_component(current_component);
					update(info.then, 1, info.value, value);
					set_current_component(null);
				},
				(error) => {
					set_current_component(current_component);
					update(info.catch, 2, info.error, error);
					set_current_component(null);
					if (!info.hasCatch) {
						throw error;
					}
				}
			);
			// if we previously had a then/catch block, destroy it
			if (info.current !== info.pending) {
				update(info.pending, 0);
				return true;
			}
		} else {
			if (info.current !== info.then) {
				update(info.then, 1, info.value, promise);
				return true;
			}
			info.resolved = /** @type {T} */ (promise);
		}
	}

	/** @returns {void} */
	function update_await_block_branch(info, ctx, dirty) {
		const child_ctx = ctx.slice();
		const { resolved } = info;
		if (info.current === info.then) {
			child_ctx[info.value] = resolved;
		}
		if (info.current === info.catch) {
			child_ctx[info.error] = resolved;
		}
		info.block.p(child_ctx, dirty);
	}

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			: [];
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	const PUBLIC_VERSION = '4';

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	var e={"":["<em>","</em>"],_:["<strong>","</strong>"],"*":["<strong>","</strong>"],"~":["<s>","</s>"],"\n":["<br />"]," ":["<br />"],"-":["<hr />"]};function n(e){return e.replace(RegExp("^"+(e.match(/^(\t| )+/)||"")[0],"gm"),"")}function r(e){return (e+"").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function t(a,c){var o,l,g,s,p,u=/((?:^|\n+)(?:\n---+|\* \*(?: \*)+)\n)|(?:^``` *(\w*)\n([\s\S]*?)\n```$)|((?:(?:^|\n+)(?:\t|  {2,}).+)+\n*)|((?:(?:^|\n)([>*+-]|\d+\.)\s+.*)+)|(?:!\[([^\]]*?)\]\(([^)]+?)\))|(\[)|(\](?:\(([^)]+?)\))?)|(?:(?:^|\n+)([^\s].*)\n(-{3,}|={3,})(?:\n+|$))|(?:(?:^|\n+)(#{1,6})\s*(.+)(?:\n+|$))|(?:`([^`].*?)`)|(  \n\n*|\n{2,}|__|\*\*|[_*]|~~)/gm,m=[],h="",i=c||{},d=0;function f(n){var r=e[n[1]||""],t=m[m.length-1]==n;return r?r[1]?(t?m.pop():m.push(n),r[0|t]):r[0]:n}function $(){for(var e="";m.length;)e+=f(m[m.length-1]);return e}for(a=a.replace(/^\[(.+?)\]:\s*(.+)$/gm,function(e,n,r){return i[n.toLowerCase()]=r,""}).replace(/^\n+|\n+$/g,"");g=u.exec(a);)l=a.substring(d,g.index),d=u.lastIndex,o=g[0],l.match(/[^\\](\\\\)*\\$/)||((p=g[3]||g[4])?o='<pre class="code '+(g[4]?"poetry":g[2].toLowerCase())+'"><code'+(g[2]?' class="language-'+g[2].toLowerCase()+'"':"")+">"+n(r(p).replace(/^\n+|\n+$/g,""))+"</code></pre>":(p=g[6])?(p.match(/\./)&&(g[5]=g[5].replace(/^\d+/gm,"")),s=t(n(g[5].replace(/^\s*[>*+.-]/gm,""))),">"==p?p="blockquote":(p=p.match(/\./)?"ol":"ul",s=s.replace(/^(.*)(\n|$)/gm,"<li>$1</li>")),o="<"+p+">"+s+"</"+p+">"):g[8]?o='<img src="'+r(g[8])+'" alt="'+r(g[7])+'">':g[10]?(h=h.replace("<a>",'<a href="'+r(g[11]||i[l.toLowerCase()])+'">'),o=$()+"</a>"):g[9]?o="<a>":g[12]||g[14]?o="<"+(p="h"+(g[14]?g[14].length:g[13]>"="?1:2))+">"+t(g[12]||g[15],i)+"</"+p+">":g[16]?o="<code>"+r(g[16])+"</code>":(g[17]||g[1])&&(o=f(g[17]||"--"))),h+=l,h+=o;return (h+a.substring(d)+$()).replace(/^\n+|\n+$/g,"")}

	/* webview_ui/components/SideBar.svelte generated by Svelte v4.2.16 */

	function create_catch_block(ctx) {
		let p;
		let t_value = /*error*/ ctx[8].message + "";
		let t;

		return {
			c() {
				p = element("p");
				t = text(t_value);
			},
			m(target, anchor) {
				insert(target, p, anchor);
				append(p, t);
			},
			p(ctx, dirty) {
				if (dirty & /*promise*/ 1 && t_value !== (t_value = /*error*/ ctx[8].message + "")) set_data(t, t_value);
			},
			d(detaching) {
				if (detaching) {
					detach(p);
				}
			}
		};
	}

	// (33:4) {:then output}
	function create_then_block(ctx) {
		let p0;
		let t1;
		let p1;
		let raw_value = t(/*output*/ ctx[7][0]['generated_text'] || 'Enter a prompt') + "";

		return {
			c() {
				p0 = element("p");
				p0.textContent = "Reponse:";
				t1 = space();
				p1 = element("p");
			},
			m(target, anchor) {
				insert(target, p0, anchor);
				insert(target, t1, anchor);
				insert(target, p1, anchor);
				p1.innerHTML = raw_value;
			},
			p(ctx, dirty) {
				if (dirty & /*promise*/ 1 && raw_value !== (raw_value = t(/*output*/ ctx[7][0]['generated_text'] || 'Enter a prompt') + "")) p1.innerHTML = raw_value;		},
			d(detaching) {
				if (detaching) {
					detach(p0);
					detach(t1);
					detach(p1);
				}
			}
		};
	}

	// (31:20)      <p>waiting...</p>     {:then output}
	function create_pending_block(ctx) {
		let p;

		return {
			c() {
				p = element("p");
				p.textContent = "waiting...";
			},
			m(target, anchor) {
				insert(target, p, anchor);
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(p);
				}
			}
		};
	}

	function create_fragment(ctx) {
		let div;
		let p;
		let t0;
		let t1_value = (/*finPrompt*/ ctx[2] || 'None') + "";
		let t1;
		let t2;
		let promise_1;
		let t3;
		let input;
		let t4;
		let button;
		let mounted;
		let dispose;

		let info = {
			ctx,
			current: null,
			token: null,
			hasCatch: true,
			pending: create_pending_block,
			then: create_then_block,
			catch: create_catch_block,
			value: 7,
			error: 8
		};

		handle_promise(promise_1 = /*promise*/ ctx[0], info);

		return {
			c() {
				div = element("div");
				p = element("p");
				t0 = text("Your prompt: ");
				t1 = text(t1_value);
				t2 = space();
				info.block.c();
				t3 = space();
				input = element("input");
				t4 = space();
				button = element("button");
				button.textContent = "Send";
				attr(input, "class", "chatBox");
				attr(input, "type", "text");
				attr(input, "id", "txt");
				attr(input, "placeholder", "Enter prompt");
				attr(button, "class", "send");
				attr(button, "id", "send_button");
				attr(div, "class", "container");
			},
			m(target, anchor) {
				insert(target, div, anchor);
				append(div, p);
				append(p, t0);
				append(p, t1);
				append(div, t2);
				info.block.m(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = t3;
				append(div, t3);
				append(div, input);
				set_input_value(input, /*prompt*/ ctx[1]);
				append(div, t4);
				append(div, button);

				if (!mounted) {
					dispose = [
						listen(input, "input", /*input_input_handler*/ ctx[5]),
						listen(button, "click", /*click_handler*/ ctx[6])
					];

					mounted = true;
				}
			},
			p(new_ctx, [dirty]) {
				ctx = new_ctx;
				if (dirty & /*finPrompt*/ 4 && t1_value !== (t1_value = (/*finPrompt*/ ctx[2] || 'None') + "")) set_data(t1, t1_value);
				info.ctx = ctx;

				if (dirty & /*promise*/ 1 && promise_1 !== (promise_1 = /*promise*/ ctx[0]) && handle_promise(promise_1, info)) ; else {
					update_await_block_branch(info, ctx, dirty);
				}

				if (dirty & /*prompt*/ 2 && input.value !== /*prompt*/ ctx[1]) {
					set_input_value(input, /*prompt*/ ctx[1]);
				}
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				info.block.d();
				info.token = null;
				info = null;
				mounted = false;
				run_all(dispose);
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let promise = 'nothing';
		let prompt = '';
		let finPrompt;

		function registerPrompt() {
			$$invalidate(2, finPrompt = prompt);
		}

		async function getAi() {
			const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct", {
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer `
				},
				method: "POST",
				body: JSON.stringify({ "inputs": `${prompt}` })
			});

			$$invalidate(0, promise = await response.json());
		}

		function input_input_handler() {
			prompt = this.value;
			$$invalidate(1, prompt);
		}

		const click_handler = () => {
			getAi();
			registerPrompt();
		};

		return [
			promise,
			prompt,
			finPrompt,
			registerPrompt,
			getAi,
			input_input_handler,
			click_handler
		];
	}

	class SideBar extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance, create_fragment, safe_not_equal, {});
		}
	}

	const app = new SideBar({
	    target: document.body,
	});

	return app;

})();
//# sourceMappingURL=sideBar.js.map
