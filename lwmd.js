const LWMD_ENUM = {
    CHAR: {
        SPACE: 32,
        NEWLINE: 10,
        BACKSLASH: 92,
        ASTERISK: 42,
        UNDERSCORE: 95,
        TILDE: 126,
        HASH: 35,
        DASH: 45,
        BACKTICK: 96,
        GREATER_THAN: 62,
        PIPE: 124,
    },

    STATE: {
        NORMAL: 0,
        SEQUENCE_HEADING: 1,
        SEQUENCE_HR: 2,
        SEQUENCE_MODIFIER: 3,
        CODE: 4,
        CODE_BLOCK: 5,
    }
}


/**
 * "Light-Weight MarkDown", a somewhat fast MD to DOM parser with first of it's kind streaming support.
 * Supports most of regular MarkDown, with some extra features, but doesn't exactly respect the original spec.
 * 
 * Uniquely, it handles streaming of modifiers by separating text as a textNode until it is confirmed, then it is wrapped.
 * It is optimized for both streaming and full document parsing, though streaming support adds some overhead for non-streaming applications.
 * 
 * @class LWMD
 * @param {string} text - The markdown text to parse
 * @param {Element} [target] - The target to append the parsed content to.
 * @param {Object} [options] - Options for the parser.
 * @param {boolean} [options.flush_on_write=true] - Whether to flush content on each write call - good for realtime rendering, not the best if you don't need instant feedback.
*/

class LWMD {
    constructor(text, target, options) {
        this.stack = []; // For direct DOM rendering, stack of elements
        this.chunks = [];

        this.options = Object.assign({
            flush_on_write: true,
            streamingMode: true,
            output_type: null // TBA. Options will be DOM (direct access) | string (HTML string). Defaults to DOM.
        }, options || {});

        if(!this.options.emptyInstance) {
            this.target = target || document.createElement("div");
    
            this.clearState();
    
            if(text) {
                this.write(text);
            }
        }
    }

    clearState() {
        this.position = 0;
        this.start = 0;

        this.streamingMode = this.options.streamingMode;

        this.uncorfinmed_start = 0;

        this.stack.length = 0;
        this.chunks.length = 0;

        this.top = this.target;
        this.stack.push(this.target);

        this.state = {
            // Locked state, prevents flushing in an incomplete state
            locked: false,

            state: LWMD_ENUM.STATE.NORMAL,
            line_start: true,

            heading_count: 0,

            hr_char: null,
            hr_count: 0,
            
            modifierStack: [] // [[char, count, ], ...]
        }
    }

    reset(target) {
        this.target = target || document.createElement("div");
        this.clearState();
    }

    /**
     * Flush content for rendering.
     */
    flush(start = this.start, end = this.position) {
        if(this.state.locked) return false;

        const string = this.getSubstring(start, end);
        if(string.length === 0) return false;

        this.top.append(string);
        this.start = this.position;
        this.uncorfinmed_start = null;

        return true;
    }

    wrapNode(node, wrapper) {
        if(typeof wrapper === "string") wrapper = document.createElement(wrapper);
        node.parentNode.insertBefore(wrapper, node);
        wrapper.appendChild(node);

        return wrapper;
    }

    static isModifierChar(char) {
        return char === LWMD_ENUM.CHAR.ASTERISK || char === LWMD_ENUM.CHAR.UNDERSCORE || char === LWMD_ENUM.CHAR.TILDE;
    }

    write(chunk) {
        if(typeof chunk !== "string") {
            if(chunk instanceof ArrayBuffer || chunk instanceof Uint8Array) {
                chunk = LWMD.decoder.decode(chunk);
            }

            chunk = String(chunk);
        }

        this.chunks.push(chunk);

        let i = -1;
        while(++i < chunk.length) {
            let char = chunk.charCodeAt(i);

            switch(this.state.state) {
                case LWMD_ENUM.STATE.NORMAL:
                    if(this.state.line_start) {
                        if(char === LWMD_ENUM.CHAR.HASH){
                            this.flush();

                            this.state.locked = true;
    
                            this.state.state = LWMD_ENUM.STATE.SEQUENCE_HEADING;
                            this.state.heading_count = 1;
                            this.uncorfinmed_start = this.position;
                        }

                        else if(char === LWMD_ENUM.CHAR.UNDERSCORE || char === LWMD_ENUM.CHAR.ASTERISK || char === LWMD_ENUM.CHAR.DASH) {
                            this.flush();

                            this.state.locked = true;
    
                            this.state.state = LWMD_ENUM.STATE.SEQUENCE_HR;
                            this.state.hr_char = char;
                            this.state.hr_count = 1;
                            this.uncorfinmed_start = this.position;
                        }
                    } else if(LWMD.isModifierChar(char)) {
                        this.flush();

                        // this.state.locked = true;
                        // this.state.modifierStack.length = 0;

                        this.state.state = LWMD_ENUM.STATE.SEQUENCE_MODIFIER;
                        this.state.modifierStack.push([char, 1]);
                        this.uncorfinmed_start = this.position + 1;
                    } else if(char === LWMD_ENUM.CHAR.BACKTICK) {
                        this.flush();

                        this.state.state = LWMD_ENUM.STATE.CODE;
                        this.uncorfinmed_start = this.position + 1;
                    }
                    break;

                case LWMD_ENUM.STATE.SEQUENCE_HR:
                    if(char === this.state.hr_char || char === LWMD_ENUM.CHAR.SPACE) {
                        this.state.hr_count ++;
                    } else {
                        this.state.state = LWMD_ENUM.STATE.NORMAL;

                        this.state.locked = false;

                        if(this.state.hr_count > 2 && char === LWMD_ENUM.CHAR.NEWLINE) {
                            this.top.append(document.createElement("hr"));
                            this.start = this.position;
                        } else {
                            if(LWMD.isModifierChar(this.state.hr_char)) {
                                this.flush();
                                this.state.state = LWMD_ENUM.STATE.SEQUENCE_MODIFIER;
                                this.state.modifierStack.push([this.state.hr_char, this.state.hr_count]);
                                this.uncorfinmed_start = this.position + 1;
                            }
                        }

                        this.state.hr_char = null;
                        this.state.hr_count = 0;
                    }
                    break;

                case LWMD_ENUM.STATE.SEQUENCE_HEADING:
                    if(char === LWMD_ENUM.CHAR.HASH){
                        this.state.heading_count ++;
                        this.uncorfinmed_start ++;
                    } else {
                        this.state.state = LWMD_ENUM.STATE.NORMAL;

                        this.state.locked = false;

                        if(char === LWMD_ENUM.CHAR.SPACE || char === LWMD_ENUM.CHAR.NEWLINE) {
                            this.uncorfinmed_start += 2;
                            this.up(`h${Math.min(6, this.state.heading_count)}`);
                            this.start = this.uncorfinmed_start;
                        } else {
                            this.state.heading_count = 0;
                        }

                        this.uncorfinmed_start = null;
                    }
                    break;

                case LWMD_ENUM.STATE.SEQUENCE_MODIFIER:
                    // By default, modifiers should be treated as text, until they are matched.

                    if (LWMD.isModifierChar(char)) {
                        const last = this.state.modifierStack[this.state.modifierStack.length - 1];

                        this.uncorfinmed_start ++;

                        if(last[1] === 1 && char === last[0]) {
                            this.state.modifierStack[this.state.modifierStack.length - 1][1] ++;
                        } else {
                            // if(last[0] === ENUM.CHAR.TILDE && last[1] === 1){
                            //     // ~this~ shouldn't do anything
                            //     this.state.modifierStack.pop();
                            // }

                            this.state.modifierStack.push([char, 1]);
                        }

                        if(this.state.modifierStack.length > 1) {
                            const prev = this.state.modifierStack[this.state.modifierStack.length - 2];
                            if(prev[0] === char && prev[1] === last[1]) {
                                // We have a match

                            }
                        }

                    } else {
                        this.state.state = LWMD_ENUM.STATE.NORMAL;

                        this.state.locked = false;

                        this.state.modifierStack[this.state.modifierStack.length - 1][2] = this.position;
                    }
            }

            if(char === LWMD_ENUM.CHAR.NEWLINE) {
                this.state.line_start = true;

                // Clear unresolved modifiers at the end of the line
                this.state.modifierStack.length = 0;

                if(this.state.heading_count > 0){
                    this.flush();
                    this.down();

                    this.state.heading_count = 0;
                }
            } else if (this.state.line_start) this.state.line_start = false;

            this.position++;
        }

        if(this.options.flush_on_write) this.flush();
    }

    /**
     * Move up in the element stack.
     * @param {HTMLElement} wrapper
     */
    up(wrapper){
        if(typeof wrapper === "string") wrapper = document.createElement(wrapper);
        this.top.append(wrapper);
        this.stack.push(wrapper);
        this.top = wrapper;
    }

    /**
     * Move down in the element stack.
     * If the stack has more than one element, it will pop the last element and set the top to the new last element.
     */
    down() {
        if(this.stack.length > 1) {
            this.stack.pop();
            this.top = this.stack[this.stack.length - 1];
        }
    }

    getSubstring(start, end) {
        // Fast path: only one chunk
        if (this.chunks.length === 1) {
            return this.chunks[0].slice(start, end);
        }

        // Fast path: start/end matches a chunk exactly
        let idx = 0;
        for (let c = 0; c < this.chunks.length; c++) {
            let chunk = this.chunks[c];
            let len = chunk.length;

            // If the requested range matches this chunk exactly
            if (idx === start && idx + len === end) {
                return chunk;
            }

            // If the requested range is fully within this chunk
            if (start >= idx && end <= idx + len) {
                return chunk.slice(start - idx, end - idx);
            }

            idx += len;
        }

        // General case: collect slices from relevant chunks
        let result = "";
        let pos = 0;
        for (let c = 0; c < this.chunks.length && start < end; c++) {
            let chunk = this.chunks[c];
            let len = chunk.length;
            let chunkStart = Math.max(0, start - pos);
            let chunkEnd = Math.min(len, end - pos);
            if (chunkStart < chunkEnd) {
                result += chunk.slice(chunkStart, chunkEnd);
            }
            pos += len;
            if (pos >= end) break;
        }

        return result;
    }

    end() {
        // TODO: Handle end of stream properly
        if(this.state.locked) {
            this.state.locked = false;
            this.flush(this.uncorfinmed_start, this.position);
        }
        this.clearState();
    }

    parse(text, target) {
        this.target = document.createDocumentFragment();

        this.clearState();
        this.streamingMode = false;
        this.write(text);
        this.end();

        if(target) {
            target.append(this.target);
        }

        return this.target || target;
    }

    static parse(text, target, options) {
        console.debug("Note: if you are parsing lots of documents, consider creating a single LWMD instance and reusing it's parse() method.");
        return new LWMD(null, null, { emptyInstance: true, ...(typeof options === "object"? options: null) || null }).parse(text, target);
    }

    static get decoder() {
        if(!LWMD._decoder) {
            LWMD._decoder = new TextDecoder("utf-8");
        }
        return LWMD._decoder;
    }
}