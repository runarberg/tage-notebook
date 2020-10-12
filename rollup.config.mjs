import html from "@open-wc/rollup-plugin-html";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";
import { terser } from "rollup-plugin-terser";

export default {
  input: "./index.html",
  output: { dir: "dist" },
  plugins: [
    html(),
    copy({
      targets: [
        { src: "styles/*.css", dest: "dist/styles/" },
        { src: "LICENSE.txt", dest: "dist/" },
      ],
      flatten: false,
    }),
    nodeResolve(),
    terser(),
  ],
};
