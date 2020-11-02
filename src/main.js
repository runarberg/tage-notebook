import "markdown-it/dist/markdown-it";
import { openDB } from "idb/with-async-ittr.js";
import mathupPlugin from "./markdown-it-plugin-mathup.js";

const md = window.markdownit();
md.use(mathupPlugin);

async function startDB() {
  const notebookDB = await openDB("Notebooks", 1, {
    upgrade(db) {
      const store = db.createObjectStore("notebooks", {
        keyPath: "id",
        autoIncrement: true,
      });

      store.createIndex("createdAt", "createdAt");
      store.createIndex("updatedAt", "updatedAt");
      store.createIndex("deletedAt", "deletedAt");
    },
  });

  if ((await notebookDB.count("notebooks")) === 0) {
    notebookDB.add("notebooks", {
      title: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      body: "",
    });
  }

  return notebookDB;
}

const startingDB = startDB();

document.addEventListener("DOMContentLoaded", () => {
  const newNotebookAnchor = document.getElementById("new-notebook");
  const notebookList = document.getElementById("notebook-list");
  const input = document.getElementById("input");
  const titleInput = document.getElementById("title");
  const output = document.getElementById("output");
  let currentNotebook;

  async function navigateToNotebook(id) {
    await save();

    const db = await startingDB;
    const notebook = await db.get("notebooks", id);
    const url = new URL(window.location);

    url.searchParams.set("notebook", id);
    window.history.pushState({ notebook: id }, "", url);
    currentNotebook = notebook;
    titleInput.value = notebook.title;
    input.value = notebook.body;
    render();
  }

  startingDB.then(async (db) => {
    {
      const url = new URL(window.location);
      const notebookId = Number.parseInt(url.searchParams.get("notebook"), 10);

      if (notebookId) {
        currentNotebook = await db.get("notebooks", notebookId);
      }
    }

    let lastOpened;
    for await (const cursor of db.transaction("notebooks").store) {
      const notebook = cursor.value;

      if (
        !currentNotebook &&
        (!lastOpened || notebook.updatedAt > lastOpened.updatedAt)
      ) {
        lastOpened = notebook;
      }

      const li = document.createElement("li");
      const anchor = document.createElement("a");

      anchor.textContent = notebook.title || "untitled";
      anchor.href = `?notebook=${notebook.id}`;
      anchor.addEventListener("click", async (event) => {
        event.preventDefault();
        navigateToNotebook(notebook.id);
      });

      li.appendChild(anchor);
      notebookList.appendChild(li);
    }

    if (lastOpened) {
      currentNotebook = lastOpened;
    }

    if (currentNotebook) {
      titleInput.value = currentNotebook.title;
      input.value = currentNotebook.body;
    } else {
      titleInput.value = "";
      input.value = "";
    }

    render();
  });

  function render() {
    output.innerHTML = md.render(input.value);
  }

  async function save() {
    const db = await startingDB;

    if (!currentNotebook) {
      return;
    }

    const tx = db.transaction("notebooks", "readwrite");
    const cursor = await tx.store.openCursor(currentNotebook.id);
    const current = { ...cursor.value };

    current.title = titleInput.value;
    current.body = input.value;
    current.updatedAt = new Date();

    cursor.update(current);

    await tx.done;
  }

  input.addEventListener("input", debounce(500, render));
  input.addEventListener("input", debounce(1000, save));
  titleInput.addEventListener(
    "input",
    debounce(500, () => {
      save();

      const anchor = document.querySelector(
        `a[href="?notebook=${currentNotebook.id}"]`
      );

      if (anchor) {
        anchor.textContent = titleInput.value || "untitled";
      }
    })
  );

  newNotebookAnchor.addEventListener("click", async (event) => {
    event.preventDefault();

    await save();
    titleInput.value = "";
    input.value = "";
    render();

    const db = await startingDB;
    const notebook = {
      title: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      body: "",
    };

    const id = await db.add("notebooks", notebook);

    currentNotebook = { id, ...notebook };

    const li = document.createElement("li");
    const anchor = document.createElement("a");

    anchor.textContent = "untitled";
    anchor.href = `?notebook=${id}`;
    anchor.addEventListener("click", async (event) => {
      event.preventDefault();
      navigateToNotebook(id);
    });

    li.appendChild(anchor);
    notebookList.appendChild(li);

    window.history.pushState({ notebook: id }, "", anchor.href);
  });

  window.addEventListener("popstate", async () => {
    await save();

    const db = await startingDB;

    const searchParams = new URLSearchParams(window.location.search);
    const id = Number.parseInt(searchParams.get("notebook"), 10);
    const notebook = await db.get("notebooks", id);

    if (notebook) {
      currentNotebook = notebook;
      titleInput.value = notebook.title;
      input.value = notebook.body;
      render();
    }
  });
});

function debounce(ms, fn) {
  let debouncing = null;

  return () => {
    if (debouncing) {
      window.clearTimeout(debouncing);
    }

    debouncing = window.setTimeout(() => {
      debouncing = null;
      fn();
    }, ms);
  };
}
