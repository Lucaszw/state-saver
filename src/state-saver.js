require('!style-loader!css-loader!jsoneditor/dist/jsoneditor.min.css');
const JSONEditor = require('jsoneditor');
const generateName = require('sillyname');
const yo = require('yo-yo');
const _ = require('lodash');

const MicrodropAsync = require('@microdrop/async');
const UIPlugin = require('@microdrop/ui-plugin');

class StateSaverUI extends UIPlugin {
  constructor(elem, focusTracker) {
    super(elem, focusTracker);
    this.json = {};
    _.extend(this.element.style, {
      overflow: "hidden"
    });
    this.stateEditorContainer = yo`<div style="zoom: 0.8"></div>`;
    this.stepEditorContainer = yo`<div style="zoom: 0.8; height:100000px"></div>`;
    this.stateEditor = null;
    this.stepEditor = null;
  }

  listen() {
    const onChange = this.stepEditorChanged.bind(this);
    this.stateEditor = new JSONEditor(this.stateEditorContainer);
    this.stepEditor = new JSONEditor(this.stepEditorContainer, {onChange});

    this.bindStateMsg("steps", "set-steps");
    this.onStateMsg("{pluginName}", "{val}", this.render.bind(this));
  }

  async stepEditorChanged() {
    const obj = _.last(this.stepEditor.history.history);
    const action = obj.action;
    const index = obj.params.index;

    const microdrop = new MicrodropAsync();
    const steps = await microdrop.getState("state-saver-ui", "steps");

    if (action == "removeNodes") {
      steps.splice(index,1);
    }

    this.trigger("set-steps", steps);
  }

  async exec(item) {
    /* Execute routes, then continue to the next step */
    const index = item.node.index;
    var microdrop = new MicrodropAsync();
    await this.loadStep(item);
    var steps = await microdrop.getState("state-saver-ui", "steps");
    var step = steps[index];
    var routes = _.get(step, ["routes-model", "routes"]);
    microdrop.routes.execute(routes);
  }

  async loadStep(item) {
    try {
      var microdrop = new MicrodropAsync();
      var steps = await microdrop.getState("state-saver-ui", "steps");
      var step = steps[item.node.index];

      this.element.style.opacity = 0.5;

      // Clear previous routes, and electrodes (incase the haven't been set)
      await put("routes-model", "routes", []);
      await put("electrodes-model", "active-electrodes", []);

      for (const [pluginName, props] of Object.entries(step)) {
        if (pluginName == "schema-model") continue;
        if (pluginName == "state-saver-ui") continue;
        if (pluginName == "device-model") continue;

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

  render(payload, pluginName, val) {
    if (pluginName == "web-server") return;
    const json = this.json;
    const loadStep = { text: "Load Step", click: this.loadStep.bind(this) };
    const execStep = { text: "Run", click: this.exec.bind(this) };

    _.set(json, [pluginName, val], payload);
    this.stateEditor.set(json);
    this.stepEditor.set(_.get(json, ["state-saver-ui", "steps"]) || []);

    this.stepEditor.node.items = [loadStep, execStep];

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

async function put(pluginName, k, v) {
  var microdrop = new MicrodropAsync();
  const msg = {};
  _.set(msg, "__head__.plugin_name", microdrop.name);
  _.set(msg, k, v);
  const dat = await microdrop.putPlugin(pluginName, k, msg);
  return dat.response;
};


module.exports = StateSaverUI;
