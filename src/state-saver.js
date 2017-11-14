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
    this.editor = null;
    this.editorContainer = yo`<div></div>`;
  }

  listen() {
    this.editor = new JSONEditor(this.editorContainer, {});
    this.bindStateMsg("snapshots", "set-snapshots");
    this.onStateMsg("{pluginName}", "{val}", this.render.bind(this));
  }

  async takeSnapshot() {
    const microdrop = new MicrodropAsync();
    let snapshots;
    // Try and get previous snapshots if they exist
    try {
      snapshots = await microdrop.getState("state-saver-ui", "snapshots", 1000);
    } catch (e) { snapshots = {};}

    // Get the current snapshot from the editor
    const snapshot = this.editor.get();
    delete snapshot["state-saver-ui"];

    // Push snapsot and update microdrops state
    snapshots[generateName()] = snapshot;
    this.trigger("set-snapshots", snapshots);
  }

  async loadSnapshot(snapshot, e) {
    const microdrop = new MicrodropAsync();

    const msg = {routes: {}, "active-electrodes": []};
    _.set(msg, "__head__.plugin_name", microdrop.name);

    // Clear previous routes, and electrodes (incase the haven't been set)
    await microdrop.putPlugin("routes-model", "routes", msg);
    await microdrop.putPlugin("electrodes-model", "active-electrodes", msg);

    for (const [pluginName, props] of Object.entries(snapshot)) {
      // Script loading schema and device
      if (pluginName == "schema-model") continue;
      if (pluginName == "device-model") continue;
      for (const [k,v] of Object.entries(props)) {
        _.set(msg, k, v);

        try {
          await microdrop.putPlugin(pluginName, k, msg, 1000);
        } catch (e) {
          console.error(e.toString());
        }
      }
    }
  }

  render(payload, pluginName, val) {
    if (pluginName == "web-server") return;
    const json = this.json;
    _.set(json, [pluginName, val], payload);
    this.editor.set(json);

    const snapshots = _.get(json, ["state-saver-ui", "snapshots"]) || [];

    this.element.innerHTML = "";
    this.element.appendChild(yo`
      <div>
        <button onclick=${this.takeSnapshot.bind(this)}>Take Snapshot</button>
        ${this.editorContainer}
        <ul>
          ${ _.map(snapshots, (v,k) => {
            return yo`
              <li>
                <a onclick=${this.loadSnapshot.bind(this, v)}>${k}</a>
              </li>`
            })
          }
        </ul>
      </div>
    `);
  }
}

module.exports = StateSaverUI;
