import '../node_modules/markdown-it/dist/markdown-it.js';
import mathupPlugin from "./markdown-it-plugin-mathup.js";

const md = window.markdownit();
md.use(mathupPlugin);

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input");
  const output = document.getElementById("output");

  function render() {
    output.innerHTML = md.render(input.value);
  }

  render();
  input.addEventListener("input", render);
});
