import "markdown-it/dist/markdown-it";
import { openDB } from "idb/with-async-ittr.js";
import mathupPlugin from "./markdown-it-plugin-mathup.js";

const md = window.markdownit();
md.use(mathupPlugin);

function displayTitle(notebook) {
  if (notebook.title) {
    return notebook.title;
  }

  const match = notebook.body.match(/^#\s+(.+)(\s+#)?\s*(\n|$)/);

  if (match?.length > 0) {
    return match[1];
  }

  return "untitled";
}

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
    input.value = notebook.body;
    render();
  }

  function createNotebookLi(notebook) {
    const li = document.createElement("li");

    li.className = "notebook";

    const anchor = document.createElement("a");
    const editField = document.createElement("input");
    const editButton = document.createElement("button");
    const doneButton = document.createElement("button");

    async function saveEdit() {
      anchor.textContent = displayTitle({
        ...notebook,
        title: editField.value,
      });

      startingDB.then(async (db) => {
        const tx = db.transaction("notebooks", "readwrite");
        const cursor = await tx.store.openCursor(notebook.id);
        const current = { ...cursor.value };

        current.title = editField.value;
        cursor.update(current);

        tx.done;
      });

      li.replaceChildren(anchor, editButton);
    }

    function cancelEdit() {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeydown);

      li.replaceChildren(anchor, editButton);
    }

    function onDocumentClick(event) {
      if (!li.contains(event.target)) {
        cancelEdit();
      }
    }

    function onDocumentKeydown(event) {
      if (event.key === "Escape") {
        cancelEdit();
      }
    }

    anchor.textContent = displayTitle(notebook);
    anchor.href = `?notebook=${notebook.id}`;
    anchor.addEventListener("click", async (event) => {
      event.preventDefault();
      navigateToNotebook(notebook.id);
    });

    editField.className = "edit-field";
    editField.value = notebook.title;
    editField.placeholder = displayTitle({ ...notebook, title: "" });
    editField.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();

        document.removeEventListener("keydown", onDocumentKeydown);
        saveEdit();
      }
    });

    editButton.className = "edit-button";
    editButton.textContent = "(edit)";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();

      li.replaceChildren(editField, doneButton);
      editField.focus();

      window.requestAnimationFrame(() => {
        document.addEventListener("click", onDocumentClick);
        document.addEventListener("keydown", onDocumentKeydown);
      });
    });

    doneButton.className = "done-button";
    doneButton.textContent = "(done)";
    doneButton.addEventListener("click", (event) => {
      event.preventDefault();

      document.removeEventListener("click", onDocumentClick);
      saveEdit();
    });

    li.append(anchor, editButton);

    return li;
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

      notebookList.appendChild(createNotebookLi(notebook));
    }

    if (lastOpened) {
      currentNotebook = lastOpened;
    }

    if (currentNotebook) {
      input.value = currentNotebook.body;
    } else {
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

    current.body = input.value;
    current.updatedAt = new Date();

    cursor.update(current);

    await tx.done;
  }

  input.addEventListener("input", debounce(500, render));
  input.addEventListener("input", debounce(1000, save));

  newNotebookAnchor.addEventListener("click", async (event) => {
    event.preventDefault();

    await save();
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

    const li = createNotebookLi({ id, ...notebook });

    notebookList.append(li);
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
