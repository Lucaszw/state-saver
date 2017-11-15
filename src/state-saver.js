require('!style-loader!css-loader!jsoneditor/dist/jsoneditor.min.css');
const JSONEditor = require('jsoneditor');
const generateName = require('sillyname');
const yo = require('yo-yo');
const _ = require('lodash');

const MicrodropAsync = require('@microdrop/async');
const UIPlugin = require('@microdrop/ui-plugin');

class StateSaverUI extends UIPlugin {
  constructor(elem, focusTracker) {
    super(elem, focusTracker, "SateSaverUI");
    this.json = {};
    this.element.style.overflow = "auto";
    this.stateEditorContainer = yo`<div></div>`;
    this.stepEditorContainer = yo`<div></div>`;
    this.stateEditor = null;
    this.stepEditor = null;
  }

  listen() {
    this.stateEditor = new JSONEditor(this.stateEditorContainer, {});
    this.stepEditor = new JSONEditor(this.stepEditorContainer, {});
    this.bindStateMsg("steps", "set-steps");
    this.onStateMsg("{pluginName}", "{val}", this.render.bind(this));
  }

  async createStep() {
    const microdrop = new MicrodropAsync();
    let steps;
    // Try and get previous steps if they exist
    try {
      steps = await microdrop.getState("state-saver-ui", "steps", 1000);
    } catch (e) { steps = [];}

    // Get the current step from the editor
    const step = this.stateEditor.get();
    delete step["state-saver-ui"];
    // Push snapsot and update microdrops state
    steps.push(step);
    this.trigger("set-steps", steps);
  }

  async loadStep(step, e) {
    const header = "__head__.plugin_name";
    try {
      this.element.style.opacity = 0.5;

      const put = async (pluginName, k, v) => {
        const microdrop = new MicrodropAsync();
        const msg = {};
        _.set(msg, header, microdrop.name);
        _.set(msg, k, v);
        await microdrop.putPlugin(pluginName, k, msg);
      };

      // Clear previous routes, and electrodes (incase the haven't been set)
      await put("routes-model", "routes", {});
      await put("electrodes-model", "active-electrodes", []);

      for (const [pluginName, props] of Object.entries(step)) {
        // Skip loading schema and state-saver
        if (pluginName == "schema-model") continue;
        if (pluginName == "state-saver-ui") continue;

        for (const [k,v] of Object.entries(props)) {
          await put(pluginName, k, v);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.element.style.opacity = 1.0;
    }
  }

  render(payload, pluginName, val) {
    if (pluginName == "web-server") return;
    const json = this.json;
    _.set(json, [pluginName, val], payload);
    this.stateEditor.set(json);
    this.stepEditor.set(_.get(json, ["state-saver-ui", "steps"]) || []);
    this.element.innerHTML = "";
    this.element.appendChild(yo`
      <div>
        <button onclick=${this.createStep.bind(this)}>Create Step</button>
        ${this.stateEditorContainer}
        ${this.stepEditorContainer}
      </div>
    `);
  }
}

module.exports = StateSaverUI;
