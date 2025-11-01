import {
  Canvas,
  CanvasGradient,
  CanvasRenderingContext2D,
  CanvasTextAlign,
  CanvasTextBaseline,
  GlobalFonts,
  Image,
  SKRSContext2D,
  createCanvas,
  loadImage,
} from "@napi-rs/canvas";
import { randomUUID } from "crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  ReadStream,
  unlinkSync,
} from "fs";
import { join } from "path";
import { v4 } from "uuid";
import { countEmojis } from "./unisym";

export class CanvCass implements CanvCass.Rect {
  static registerFont(font: CanvCass.Font) {
    CanvCass.fonts.registerFromPath(font.path, font.name);
  }

  static ID = v4();

  static async singleSetup() {
    logger("Registering fonts...", "CanvCass");
    this.registerFont({
      name: "EMOJI",
      path: "./public/NotoColorEmoji.ttf",
    });
    this.registerFont({
      name: "Cassieah",
      path: "./public/fonts/SFPRODISPLAYREGULAR.OTF",
    });
    this.registerFont({
      name: "Cassieah-Bold",
      path: "./public/fonts/SFPRODISPLAYBOLD.OTF",
    });

    logger("Fonts registered!", "CanvCass");
  }

  static fonts = GlobalFonts;

  #config: CanvCass.CreateConfig;

  #canvas: Canvas;
  #context: SKRSContext2D;
  static createRect(basis: Partial<CanvCass.MakeRectParam>): CanvCass.Rect {
    const { width, height } = basis;

    if (typeof width !== "number" || typeof height !== "number") {
      throw new Error(
        "createRect: width and height must be provided as numbers."
      );
    }

    const x = basis.centerX ?? basis.centerX;
    const y = basis.centerY ?? basis.centerY;

    const left =
      basis.left ??
      (typeof x === "number"
        ? x - width / 2
        : typeof basis.right === "number"
        ? basis.right - width
        : undefined);

    const top =
      basis.top ??
      (typeof y === "number"
        ? y - height / 2
        : typeof basis.bottom === "number"
        ? basis.bottom - height
        : undefined);

    if (typeof left !== "number" || typeof top !== "number") {
      throw new Error(
        "createRect: insufficient data to calculate position. Provide at least (x/y), (right/bottom), or (left/top)."
      );
    }

    return {
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  }

  constructor(width: number, height: number);
  constructor({ width, height, background }: CanvCass.CreateConfig);

  constructor(...args: [number, number] | [CanvCass.CreateConfig]) {
    let config: CanvCass.CreateConfig;

    if (typeof args[0] === "number" && typeof args[1] === "number") {
      config = {
        width: args[0],
        height: args[1],
      };
    } else if (config && "width" in config && "height" in config) {
      config = args[0] as CanvCass.CreateConfig;
    } else {
      throw new TypeError("Invalid First Parameter (Config)");
    }

    config.background ??= null;

    this.#config = config;
    this.#canvas = createCanvas(config.width, config.height);
    this.#context = this.#canvas.getContext("2d");

    return this;
  }

  static premade() {
    return new CanvCass(CanvCass.preW, CanvCass.preH);
  }

  changeScale(size: number) {
    this.#canvas.width *= size;
    this.#canvas.height *= size;
    this.#context.scale(size, size);
  }

  reset() {
    this.#context.resetTransform();
    this.#canvas.width = this.#config.width;
    this.#canvas.height = this.#config.height;
  }

  static preW = 1024;
  static preH = 768;

  get config() {
    return this.#config;
  }

  get realWidth() {
    return this.#canvas.width;
  }

  get realHeight() {
    return this.#canvas.height;
  }

  get width() {
    return this.#config.width;
  }
  get height() {
    return this.#config.height;
  }
  get left() {
    return 0;
  }
  get top() {
    return 0;
  }
  get right() {
    return this.width;
  }
  get bottom() {
    return this.height;
  }
  get centerX() {
    return this.width / 2;
  }
  get centerY() {
    return this.height / 2;
  }

  async drawBackground() {
    if (this.#config.background !== null) {
      this.drawBox({
        left: this.left,
        top: this.top,
        width: this.width,
        height: this.height,
        fill: this.#config.background,
      });
    } else {
      const bg = await loadImage(
        join(process.cwd(), "public", "canvcassbg.png")
      );
      if (bg) {
        this.#context.drawImage(
          bg,
          this.left,
          this.top,
          this.width,
          this.height
        );
      }
    }
  }

  get rect(): CanvCass.Rect {
    return {
      width: this.width,
      height: this.height,
      left: this.left,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      centerX: this.centerX,
      centerY: this.centerY,
    };
  }

  withContext(cb: (ctx: SKRSContext2D) => void): void {
    const ctx = this.#context;
    ctx.save();
    try {
      cb(ctx);
    } finally {
      ctx.restore();
    }
  }

  toPng() {
    return this.#canvas.toBuffer("image/png");
  }

  toStream(): Promise<ReadStream> {
    const tempDir = join(process.cwd(), "temp");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir);
    }

    const filename = `${randomUUID()}.png`;
    const filePath = join(tempDir, filename);
    const buffer = this.#canvas.toBuffer("image/png");

    return new Promise((resolve, reject) => {
      const out = createWriteStream(filePath);

      out.on("error", reject);

      out.write(buffer, (err) => {
        if (err) return reject(err);
        out.end();
      });

      out.on("finish", () => {
        const stream = createReadStream(filePath);
        stream.on("close", () => {
          try {
            unlinkSync(filePath);
          } catch (err) {
            console.error(`Failed to delete temp file ${filePath}`, err);
          }
        });
        resolve(stream);
      });
    });
  }

  drawBox(style?: { rect: CanvCass.Rect } & Partial<CanvCass.DrawParam>): void;
  drawBox(style: CanvCass.DrawBoxInlineParam): void;
  drawBox(
    left: number,
    top: number,
    width: number,
    height: number,
    style?: Partial<CanvCass.DrawBoxInlineParam>
  ): void;

  drawBox(
    arg1:
      | number
      | ({ rect: CanvCass.Rect } & Partial<CanvCass.DrawParam>)
      | CanvCass.DrawBoxInlineParam,
    arg2?: number | Partial<CanvCass.DrawBoxInlineParam>,
    arg3?: number,
    arg4?: number,
    arg5?: Partial<CanvCass.DrawBoxInlineParam>
  ): void {
    let rect: CanvCass.Rect;
    let style: CanvCass.DrawParam = {};

    if (
      typeof arg1 === "number" &&
      typeof arg2 === "number" &&
      typeof arg3 === "number" &&
      typeof arg4 === "number"
    ) {
      rect = CanvCass.createRect({
        left: arg1,
        top: arg2,
        width: arg3,
        height: arg4,
      });
      style = arg5 ?? {};
    } else if (typeof arg1 !== "number" && "rect" in arg1) {
      rect = arg1.rect;
      style = arg1;
      if ("rect" in style) {
        delete style.rect;
      }
    } else if (typeof arg1 !== "number") {
      const inline = arg1;
      rect = CanvCass.createRect({
        ...inline,
      });
      style = inline;
    } else {
      throw new TypeError(
        "Invalid Arguments, please check the method overloads."
      );
    }

    const ctx = this.#context;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);

    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = Number(style.strokeWidth ?? "1");
      ctx.stroke();
    }

    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }

    ctx.restore();
  }

  drawPolygon(points: number[][], style?: CanvCass.DrawParam): void {
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error("drawPolygon requires at least 3 points.");
    }

    const ctx = this.#context;
    const { fill, stroke, strokeWidth } = style ?? {};

    ctx.save();
    ctx.beginPath();

    ctx.moveTo(points[0][0], points[0][1]);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }

    ctx.closePath();

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Number(strokeWidth ?? "1");
      ctx.stroke();
    }

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    ctx.restore();
  }

  drawLine(
    start: [number, number],
    end: [number, number],
    style?: CanvCass.DrawParam
  ): void;
  drawLine(points: [number, number][], style?: CanvCass.DrawParam): void;
  drawLine(
    arg1: [number, number] | [number, number][],
    arg2?: [number, number] | CanvCass.DrawParam,
    arg3?: CanvCass.DrawParam
  ): void {
    let start: [number, number];
    let end: [number, number];
    let style: CanvCass.DrawParam = {};

    if (Array.isArray(arg1[0])) {
      const points = arg1 as [number, number][];
      if (points.length !== 2) {
        throw new Error("drawLine requires exactly two points.");
      }
      [start, end] = points;
      style = (arg2 as CanvCass.DrawParam) ?? {};
    } else {
      start = arg1 as [number, number];
      end = arg2 as [number, number];
      style = arg3 ?? {};
    }

    const ctx = this.#context;
    const { stroke, strokeWidth } = style;

    if (!stroke) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Number(strokeWidth ?? "1");
    ctx.stroke();
    ctx.restore();
  }

  drawCircle(
    center: [number, number],
    radius: number,
    style?: CanvCass.DrawCircleParamN
  ): void;
  drawCircle(config: CanvCass.DrawCircleParam): void;
  drawCircle(
    arg1: [number, number] | CanvCass.DrawCircleParam,
    arg2?: number,
    arg3?: CanvCass.DrawCircleParamN
  ): void {
    let centerX: number;
    let centerY: number;
    let radius: number;
    let style: CanvCass.DrawParam = {};

    if (
      typeof arg1 === "number" &&
      typeof arg2 === "number" &&
      typeof arg3 !== "number"
    ) {
      centerX = arg1;
      centerY = arg2;
      radius = arg3?.radius ?? 0;
      style = arg3 ?? {};
    } else if (Array.isArray(arg1) && typeof arg3 !== "number") {
      centerX = arg1[0];
      centerY = arg1[1];
      radius = arg2 ?? 0;
      style = arg3 ?? {};
    } else {
      const config = arg1 as CanvCass.DrawCircleParam;
      [centerX, centerY] = config.center;
      radius = config.radius;
      style = config;
    }

    const ctx = this.#context;
    const { fill, stroke, strokeWidth } = style;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Number(strokeWidth ?? "1");
      ctx.stroke();
    }

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    ctx.restore();
  }

  drawFlexbox(
    container: {
      rect: CanvCass.Rect;
      flexDirection?: "row" | "column";
      justifyContent?:
        | "flex-start"
        | "center"
        | "flex-end"
        | "space-between"
        | "space-around";
      alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
      gap?: number;
    },
    children: Array<
      | (Partial<CanvCass.MakeRectParam> & { fill?: CanvCass.Color })
      | ((rect: CanvCass.Rect, index: number) => void)
    >
  ) {
    const {
      rect: containerRect,
      flexDirection = "row",
      justifyContent = "flex-start",
      alignItems = "flex-start",
      gap = 0,
    } = container;

    const isRow = flexDirection === "row";
    const containerMain = isRow ? containerRect.width : containerRect.height;
    const containerCross = isRow ? containerRect.height : containerRect.width;

    const childSizes = children.map((child) => {
      if (typeof child === "function") return { width: 0, height: 0 };
      return { width: child.width!, height: child.height! };
    });

    let totalMain =
      childSizes.reduce((sum, c) => sum + (isRow ? c.width : c.height), 0) +
      Math.max(0, children.length - 1) * gap;

    let adjustedGap = gap;
    let mainStart = 0;
    const extraSpace = containerMain - totalMain;

    switch (justifyContent) {
      case "flex-start":
        mainStart = 0;
        break;
      case "center":
        mainStart = extraSpace / 2;
        break;
      case "flex-end":
        mainStart = extraSpace;
        break;
      case "space-between":
        mainStart = 0;
        adjustedGap =
          children.length > 1 ? extraSpace / (children.length - 1) : 0;
        break;
      case "space-around":
        adjustedGap = extraSpace / children.length;
        mainStart = adjustedGap / 2;
        break;
    }

    let pos = mainStart;

    children.forEach((child, idx) => {
      let width: number, height: number;

      if (typeof child === "function") {
        width = childSizes[idx].width || 0;
        height = childSizes[idx].height || 0;
      } else {
        width = child.width!;
        height = child.height!;
      }

      let crossPos = 0;
      switch (alignItems) {
        case "flex-start":
          crossPos = 0;
          break;
        case "center":
          crossPos = (containerCross - (isRow ? height : width)) / 2;
          break;
        case "flex-end":
          crossPos = containerCross - (isRow ? height : width);
          break;
        case "stretch":
          if (isRow) height = containerCross;
          else width = containerCross;
          crossPos = 0;
          break;
      }

      let childRect: CanvCass.Rect;
      if (isRow) {
        childRect = CanvCass.createRect({
          width,
          height,
          left: containerRect.left + pos,
          top: containerRect.top + crossPos,
        });
        pos += width + adjustedGap;
      } else {
        childRect = CanvCass.createRect({
          width,
          height,
          left: containerRect.left + crossPos,
          top: containerRect.top + pos,
        });
        pos += height + adjustedGap;
      }

      if (typeof child === "function") {
        child(childRect, idx);
      } else {
        this.drawBox({
          rect: childRect,
          fill: child.fill,
        });
      }
    });
  }

  drawText(
    text: string,
    x: number,
    y: number,
    options?: Partial<CanvCass.DrawTextParam>
  ): void;
  drawText(text: string, options: Partial<CanvCass.DrawTextParam>): void;
  drawText(config: CanvCass.DrawTextParam): void;

  drawText(
    arg1: string | CanvCass.DrawTextParam,
    arg2?: number | Partial<CanvCass.DrawTextParam>,
    arg3?: number,
    arg4?: Partial<CanvCass.DrawTextParam>
  ): void {
    const ctx = this.#context;

    let text: string;
    let x: number;
    let y: number;
    let options: Partial<CanvCass.DrawTextParam> = {};

    if (
      typeof arg1 === "string" &&
      typeof arg2 === "number" &&
      typeof arg3 === "number"
    ) {
      text = arg1;
      x = arg2;
      y = arg3;
      options = arg4 ?? {};
    } else if (typeof arg1 === "string" && typeof arg2 === "object") {
      text = arg1;
      const opt = arg2 as Partial<CanvCass.DrawTextParam>;
      x = opt.x ?? 0;
      y = opt.y ?? 0;
      options = opt;
    } else {
      const config = arg1 as CanvCass.DrawTextParam;
      text = config.text;
      x = config.x;
      y = config.y;
      options = config;
    }

    this.#processFont(options);

    const {
      fill = "white",
      stroke,
      strokeWidth = 1,
      cssFont: font = "",
      align = "center",
      baseline = "middle",
      vAlign = "middle",
      size,
      yMargin = 0,
      breakTo = "bottom",
      breakMaxWidth = Infinity,
    } = options;

    if (vAlign === "top") {
      y -= size / 2;
    }

    if (vAlign === "bottom") {
      y += size / 2;
    }

    ctx.save();

    const lineHeight = size + (yMargin ?? 0);
    const direction = breakTo === "top" ? -1 : 1;

    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    const lines = this.splitBreak(
      {
        ...options,
        text,
      },
      breakMaxWidth
    ).filter(Boolean);

    let tx = x;
    let ty = y;

    if (breakTo === "top") {
      lines.reverse();
      ty -= lineHeight * (lines.length - 1);
    }

    switch (vAlign) {
      case "top":
        break;
      case "middle":
        ty -= (lineHeight * (lines.length - 1)) / 2;
        break;
      case "bottom":
        ty -= lineHeight * (lines.length - 1);
        break;
    }
    for (const line of lines) {
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(line, tx, ty);
      }
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillText(line, tx, ty);
      }
      ty += lineHeight * direction;
    }

    ctx.restore();
  }

  #processFont(options: Partial<CanvCass.DrawTextParam>) {
    if (!options.cssFont) {
      options.fontType ??= "cnormal";
      options.size ??= 50;
      if (options.fontType === "cbold") {
        options.cssFont = `bold ${options.size}px Cassieah-Bold, EMOJI, sans-serif`;
      }
      if (options.fontType === "cnormal") {
        options.cssFont = `normal ${options.size}px Cassieah, EMOJI, sans-serif`;
      }
    }
  }

  static colorA = "#9700af";
  static colorB = "#a69a00";

  defaultGradient(width: number, height: number) {
    return this.tiltedGradient(width, height, Math.PI / 4, [
      [0, CanvCass.colorB],
      [1, CanvCass.colorA],
    ]);
  }

  measureText(style: CanvCass.MeasureTextParam) {
    const ctx = this.#context;
    ctx.save();
    this.#processFont(style);
    const { cssFont: font = "" } = style;
    ctx.font = font;
    const result = ctx.measureText(style.text);

    ctx.restore();

    return result;
  }

  splitBreak(style: CanvCass.MeasureTextParam, maxW: number) {
    let accuW = 0;
    const text = style.text;
    let words: string[] = [];
    let lines: string[] = [];
    const split = text.split(" ");
    let ii = 0;
    for (const word of split) {
      const w = this.measureText({
        ...style,
        text: word + " ",
      }).width;
      if (w > maxW) {
        // continue;
      }
      accuW += w;
      if (accuW >= maxW) {
        lines.push(words.join(" "));
        accuW = 0;
        words = [word];
      } else {
        words.push(word);
      }
      if (ii + 1 >= split.length) {
        lines.push(words.join(" "));
      }
      ii++;
    }
    return lines;
  }

  tiltedGradient(
    width: number,
    height: number,
    angleRad: number,
    colorStops: [number, string][]
  ): CanvasGradient {
    const cx = width / 2;
    const cy = height / 2;

    const halfLen = Math.sqrt(width ** 2 + height ** 2) / 2;

    const dx = Math.cos(angleRad) * halfLen;
    const dy = Math.sin(angleRad) * halfLen;

    const x0 = cx - dx;
    const y0 = cy - dy;
    const x1 = cx + dx;
    const y1 = cy + dy;

    const gradient = this.#context.createLinearGradient(x0, y0, x1, y1);

    for (const [offset, color] of colorStops) {
      gradient.addColorStop(offset, color);
    }

    return gradient;
  }

  async drawImage(
    image: Image,
    x: number,
    y: number,
    options?: { width?: number; height?: number }
  ): Promise<void>;
  async drawImage(
    src: string | Buffer,
    x: number,
    y: number,
    options?: { width?: number; height?: number }
  ): Promise<void>;

  async drawImage(
    imageOrSrc: string | Buffer | Image,
    x: number,
    y: number,
    options?: {
      width?: number;
      height?: number;
    }
  ): Promise<void> {
    const ctx = this.#context;

    let image: Image;

    if (typeof imageOrSrc !== "string" && "onload" in imageOrSrc) {
      image = imageOrSrc;
    } else {
      image = await loadImage(imageOrSrc);
    }

    ctx.save();

    if (options?.width && options?.height) {
      ctx.drawImage(image, x, y, options.width, options.height);
    } else {
      ctx.drawImage(image, x, y);
    }

    ctx.restore();
  }

  drawCassItem({
    rect,
    item,
    dontDrawRect = false,
  }: {
    rect: CanvCass.Rect;
    item: UserData["inventory"][number];
    dontDrawRect?: boolean;
  }) {
    if (!dontDrawRect) {
      this.drawBox({
        rect,
        fill: "rgba(0, 0, 0, 0.5)",
      });
    }
    const spacing = rect.width / 8;

    const iconLen = countEmojis(item.icon);
    this.drawText(`${item.icon}`, {
      x: rect.centerX,
      y: rect.centerY,
      align: "center",
      baseline: "middle",
      fontType: "cnormal",
      fill: "white",
      size: rect.width / iconLen - spacing * 2,
    });
  }
}

export namespace CanvCass {
  export interface Font {
    name: string;
    path: string;
  }

  export interface CreateConfig {
    width: number;
    height: number;
    background?: string | null;
  }
  export type MakeRectParam = {
    width: number;
    height: number;
    top?: number;
    left?: number;
    centerX?: number;
    centerY?: number;
    right?: number;
    bottom?: number;
  };

  export interface DrawParam {
    stroke?: string;
    fill?: Color;
    strokeWidth?: number;
  }

  export type DrawBoxInlineParam = DrawParam & MakeRectParam;

  export interface Rect {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    top: number;
    left: number;
    bottom: number;
    right: number;
  }

  export interface DrawCircleParam extends DrawParam {
    center: [number, number];
    radius: number;
  }
  export interface DrawCircleParamN extends DrawParam {
    center?: [number, number];
    radius?: number;
  }

  export interface DrawTextParam {
    text: string;
    x: number;
    y: number;
    yMargin?: number;
    breakMaxWidth?: number;
    breakTo?: "top" | "bottom";
    cssFont?: string;
    fontType?: "cbold" | "cnormal" | "css";
    size?: number;
    fill?: Color;
    stroke?: string;
    strokeWidth?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    vAlign?: "middle" | "top" | "bottom";
  }
  export interface MeasureTextParam {
    text: string;
    cssFont?: string;
    fontType?: "cbold" | "cnormal" | "css";
    size?: number;
  }

  export function lineYs(height: number, lines: number, offset = 0): number[] {
    if (lines <= 0) return [];

    const spacing = height / lines;
    const halfSpacing = spacing / 2;
    const ys: number[] = [];

    for (let i = 0; i < lines; i++) {
      ys.push(Math.round(halfSpacing + spacing * i + offset));
    }

    return ys;
  }

  export type Color = string | CanvasGradient;
}
