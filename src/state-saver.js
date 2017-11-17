require('!style-loader!css-loader!jsoneditor/dist/jsoneditor.min.css');
const JSONEditor = require('jsoneditor');
const generateName = require('sillyname');
const yo = require('yo-yo');
const _ = require('lodash');

const MicrodropAsync = require('@microdrop/async/MicrodropAsync');
const UIPlugin = require('@microdrop/ui-plugin');

class StateSaverUI extends UIPlugin {
  constructor(elem, focusTracker) {
    super(elem, focusTracker);
    this.json = {};
    _.extend(this.element.style, {
      overflow: "auto"
    });

    this.view = "top";
    this.container = yo`<div style="zoom: 0.8; height:1000px"></div>`;
    const onChange = this.onChange.bind(this);
    this.editor = new JSONEditor(this.container, {onChange});
  }

  async listen() {
    this.bindStateMsg("steps", "set-steps");
    this.onStateMsg("{pluginName}", "{val}", this.render.bind(this));
    this.draw();
  }

  onChange() {
    if (this.view == "steps") this.changeSteps();
    if (this.view == "route") this.changeRoute();
  }

  async changeSteps() {
    const obj = _.last(this.editor.history.history);
    const action = obj.action;
    const index = obj.params.index;

    const microdrop = new MicrodropAsync();
    const steps = await microdrop.getState("state-saver-ui", "steps");

    if (action == "removeNodes") {
      steps.splice(index,1);
    }

    this.trigger("set-steps", steps);
  }

  async changeRoute() {
    const obj = _.last(this.editor.history.history);
    const microdrop = new MicrodropAsync();
    microdrop.routes.putRoute(this.editor.get());
  }

  async exec(item, steps, index) {
    /* Execute routes, then continue to the next step */
    index = index || item.node.index;
    var microdrop = new MicrodropAsync();
    steps = steps || await microdrop.getState("state-saver-ui", "steps");
    await this.loadStep(item, index, steps);
    var step = steps[index];
    var routes = _.get(step, ["routes-model", "routes"]);
    if (routes) await microdrop.routes.execute(routes, -1);
    index += 1;
    if (steps[index]) this.exec(item, steps, index);
  }

  async loadStep(item, index, steps) {
    try {
      index = index || item.node.index;
      var microdrop = new MicrodropAsync();
      steps = steps || await microdrop.getState("state-saver-ui", "steps");
      var step = steps[index];

      this.element.style.opacity = 0.5;

      // Clear previous routes, and electrodes (incase the haven't been set)
      await put("routes-model", "routes", [], 500);
      await put("electrodes-model", "active-electrodes", [], 500);

      for (const [pluginName, props] of Object.entries(step)) {
        const subs = await microdrop.getSubscriptions(pluginName);

        for (const [k,v] of Object.entries(props)) {
          try {
            // Get the subscriptions for the pluginName
            if (_.includes(subs, `microdrop/put/${pluginName}/${k}`)) {
              await put(pluginName, k, v, 500);
            }
          } catch (e) {
            console.error(e, {pluginName, k, v});
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.element.style.opacity = 1.0;
    }
  }

  changeView(e) {
    this.view  = e.target.value;
    this.render();
  }

  async createStep() {
    const microdrop = new MicrodropAsync();
    let steps;
    // Try and get previous steps if they exist
    try {
      steps = await microdrop.getState("state-saver-ui", "steps", 1000);
    } catch (e) { steps = [];}

    // Get the current step from the editor
    const json = _.clone(this.json);

    const step = {
      "routes-model": json["routes-model"],
      "electrodes-model": json["electrodes-model"]
    };

    // Push snapsot and update microdrops state
    steps.push(step);
    this.trigger("set-steps", steps);
  }

  render(payload, pluginName, val) {
    if (pluginName == "web-server") return;
    if (payload) _.set(this.json, [pluginName, val], payload);

    if (this.view == "top") this.renderTopView();
    if (this.view == "steps") this.renderStepView();
    if (this.view == "electrode") this.renderSelectedElectrode();
    if (this.view == "route") this.renderSelectedRoute();
  }

  draw() {
    const name = `radios-${generateName()}`;

    this.element.innerHTML = "";
    this.element.appendChild(yo`
      <div>
        <div>
           <input onclick=${this.changeView.bind(this)}
             name="${name}" type="radio" value="top" checked>
           <label>Top</label>

           <input onclick=${this.changeView.bind(this)}
             name="${name}" type="radio" value="steps">
           <label>Steps</label>

           <input onclick=${this.changeView.bind(this)}
             name="${name}" type="radio" value="electrode">
           <label>Selected Electrode</label>

           <input onclick=${this.changeView.bind(this)}
             name="${name}" type="radio" value="route">
           <label>Selected Route</label>

         </div>

        <button onclick=${this.createStep.bind(this)}
        >Create Step</button>
        ${this.container}
      </div>
    `);
  }

  renderTopView() {
    this.editor.set(this.json);
  }

  renderStepView() {
    const loadStep = { text: "Load Step", click: this.loadStep.bind(this) };
    const execStep = { text: "Run", click: this.exec.bind(this) };
    this.editor.set(_.get(this.json, ["state-saver-ui", "steps"]) || []);
    this.editor.node.items = [loadStep, execStep];
  }

  async renderSelectedElectrode() {
    const LABEL = "StateSaver::renderSelectedElectrode";
    try {
      const microdrop = new MicrodropAsync();
      let id = await microdrop.getState("electrode-controls", "selected-electrode", 500);

      const electrodes = _.get(this.json, ["device-model", "three-object"]) || [];
      this.editor.set(_.find(electrodes, { id }));

    } catch (e) {
      console.error(LABEL, e);
    }
  }

  async renderSelectedRoute() {
    const LABEL = "StateSaver::renderSelectedRoute";
    try {
      const microdrop = new MicrodropAsync();
      let uuid = await microdrop.getState("route-controls", "selected-route", 500);

      const routes = _.get(this.json, ["routes-model", "routes"]) || [];
      this.editor.set(_.find(routes, { uuid }));

    } catch (e) {
      console.error(LABEL, e);
    }
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
