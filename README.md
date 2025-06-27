# LWMD
The first of it's kind Light-Weight MarkDown to HTML/DOM parser with full streaming support.

It is a no-dependency, single file JavaScript library that allows you to parse Markdown and render it directly to DOM in real time, as it is being received.

It also supports regular fast document parsing, in cases where you need to parse lots of Markdown documents at once, such as chat threads.

One of the main strengths is it's highly efficient handling of streams, which takes minimal processing time and memory, allowing you to parse and render Markdown documents in real time without blocking the UI.
One useful application of this is AI response streaming, where you can efficiently render the response as it is being generated.

# Features
- **Streaming**: Parse and render Markdown as it is being read.
- **Lightweight**: No dependencies, single file, no bloat. Only 2.2kB minified and gzipped!
- **Fast**: Optimized for performance.
- **Customizable**: Tailor the parser to fit your needs.

WebWorkers are not supported and will not be supported, as it does not make sense to use them for this kind of task - using a WebWorker would nearly double the overhead and make the parsing to DOM slower and less efficient. WebWorker !== magic performance enhancer.

# Usage
The API designed to be as simple as possible. To get started, you simply import the library and you can start parsing right away.
## With streaming and realtime rendering
```js
// Create or get an element to render the Markdown in
const element = document.createElement('div');
document.body.appendChild(element);

// Create a new LWMD instance
const parser = new LWMD(null, element);

// You can simply start streaming and rendering Markdown
parser.write("#");
parser.write("This is a");
parser.write(" test.");
parser.write("\n\n## Another Heading\nAnd some *mo");
parser.write("re* text.");
parser.end();
```

## Without streaming
If you have the full document, this is slightly faster and avoids rendering while flushing.<br>
Note that this creates a new parser instance each time.
```js
LWMD.parse("*Hello*", element);
```

## Batch/mass processing
If you have lots of documents (eg. a full chat thread of Markdown messages to parse), this method is the most efficient for that use case.<br>
You avoid the overhead of multiple parser instances and allow the parser to schedule parsing more efficiently - internally, each parsing job just clears the state, otherwise is pretty much the same as a regular write operation.
```js
// Create a shared parser instance
const parser = new LWMD();

// Parse as many documents as you need
const first = parser.parse("# This is a markdown document parsed into DOM");
const second = parser.parse("# This is a separate document reusing the same instance");
// ...

// Or render directly to an element
parser.parse("## This text will be rendered directly inside the element", element);
```