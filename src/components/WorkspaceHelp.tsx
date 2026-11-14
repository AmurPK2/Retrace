import { ToolIcon } from "./ToolIcon";

const tools = [
  [
    "select",
    "Select & move",
    "Click inside a shape to select it. Drag its body to move; drag a handle to resize. Click empty space to deselect.",
  ],
  [
    "horizontal",
    "Horizontal line",
    "Click once at a price. Drag the line or its handle to adjust.",
  ],
  [
    "ray",
    "Ray",
    "Choose two points, or hold and drag. The ray continues through the second point.",
  ],
  [
    "trend",
    "Trend line",
    "Choose two endpoints, or hold and drag. Both ends remain editable.",
  ],
  [
    "zone",
    "Rectangle",
    "Hold and drag across a price area. Select its body; resize from an edge or corner.",
  ],
  [
    "fib",
    "Fibonacci",
    "Drag between two anchors. Select it, then edit its levels in the object toolbar.",
  ],
  [
    "long",
    "Long position",
    "A buy planning box. Entry, SL, TP and width move independently. This drawing does not place an order.",
  ],
  [
    "short",
    "Short position",
    "A sell planning box. Edit SL or target directly; use the R:R field to set a target from the stop distance.",
  ],
  [
    "magnet",
    "Magnet",
    "Click to cycle Off → Weak → Strong. Hold Ctrl while drawing to temporarily toggle snapping. Order levels remain freely draggable.",
  ],
] as const;

export function WorkspaceHelp() {
  return (
    <div className="workspace-help">
      <section>
        <h3>Draw on the chart</h3>
        <p>
          Hover over any toolbar icon to see its name. Drawings stay anchored to
          time and price while you pan or zoom.
        </p>
        <div className="tool-guide">
          {tools.map(([kind, title, text]) => (
            <div className="tool-guide-row" key={kind}>
              <ToolIcon kind={kind} />
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Make an order</h3>
        <p>
          Click <b>Make order</b>, then drag the entry line. Above the current
          bid it becomes <b>Sell level</b>; below it becomes <b>Buy level</b>.
          Add SL or TP and drag them into place. Review size and cash risk, then
          click <b>Place order</b>.
        </p>
        <p>
          <b>Cancel draft</b> discards the preview. For a placed pending order,
          use its chart × or Cancel in Orders. Positions are managed separately
          in Positions.
        </p>
      </section>
      <section>
        <h3>Shortcuts</h3>
        <dl className="shortcut-guide">
          <dt>
            <kbd>Space</kbd>
          </dt>
          <dd>Play / pause replay</dd>
          <dt>
            <kbd>→</kbd>
          </dt>
          <dd>Advance one candle</dd>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>Close a dialog; otherwise cancel the draft and deselect</dd>
          <dt>
            <kbd>Ctrl Z</kbd>
          </dt>
          <dd>Undo drawing change</dd>
          <dt>
            <kbd>Ctrl Y</kbd> / <kbd>Ctrl Shift Z</kbd>
          </dt>
          <dd>Redo drawing change</dd>
          <dt>
            <kbd>Delete</kbd>
          </dt>
          <dd>Delete the selected drawing</dd>
          <dt>
            <kbd>?</kbd>
          </dt>
          <dd>Open this guide and pause replay</dd>
        </dl>
        <p className="help-note">
          Typing fields keep their normal editing shortcuts. Replay shortcuts
          are inactive while a dialog is open.
        </p>
      </section>
    </div>
  );
}
