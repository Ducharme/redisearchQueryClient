import { ShapeType, Shape, BaseShapeArray } from "./shapeTypes";
import { redisClient } from "./redisClient";
const h3 = require("h3-js");

export class shapeCache {

  private readonly rec: redisClient;
  private readonly shapes = new Map<ShapeType, Shape[]>();
  static readonly UNDEFINED = "UNDEFINED";

  constructor(rc: redisClient) {
    this.rec = rc;
    this.shapes.set(ShapeType.Limit, []);
    this.shapes.set(ShapeType.NoGo, []);
    this.shapes.set(ShapeType.Parking, []);
    this.shapes.set(ShapeType.NoParking, []);
  }

  public async downloadAllActiveShapes() {
    await this.downloadShapeType(ShapeType.Limit);
    await this.downloadShapeType(ShapeType.NoGo);
    await this.downloadShapeType(ShapeType.Parking);
    await this.downloadShapeType(ShapeType.NoParking);
  }

  private async downloadShapeType(shapeType: ShapeType) {
    var list : Shape[] = [];
    var arr: BaseShapeArray = await this.rec.listShapes(shapeType, "ACTIVE");
    for (const item of arr) {
      var shape = await this.rec.getShape(item.value.shapeId);
      if (shape !== undefined) {
        list.push(shape);
      }
    }
    this.shapes.set(shapeType, list);
  }

  public getShapesWithinIndex(h3index: string, status: string) {
    var h3res = h3.h3GetResolution(h3index);

    var filter = {
      'h3r0': this.getFilterAtResolution(h3index, h3res, 0),
      'h3r1': this.getFilterAtResolution(h3index, h3res, 1),
      'h3r2': this.getFilterAtResolution(h3index, h3res, 2),
      'h3r3': this.getFilterAtResolution(h3index, h3res, 3),
      'h3r4': this.getFilterAtResolution(h3index, h3res, 4),
      'h3r5': this.getFilterAtResolution(h3index, h3res, 5),
      'h3r6': this.getFilterAtResolution(h3index, h3res, 6),
      'h3r7': this.getFilterAtResolution(h3index, h3res, 7),
      'h3r8': this.getFilterAtResolution(h3index, h3res, 8),
      'h3r9': this.getFilterAtResolution(h3index, h3res, 9),
      'h3r10': this.getFilterAtResolution(h3index, h3res, 10),
      'h3r11': this.getFilterAtResolution(h3index, h3res, 11),
      'h3r12': this.getFilterAtResolution(h3index, h3res, 12),
      'h3r13': this.getFilterAtResolution(h3index, h3res, 13),
      'h3r14': this.getFilterAtResolution(h3index, h3res, 14),
      'h3r15': this.getFilterAtResolution(h3index, h3res, 15)
    };

    var shapes: string[] = [];
    for (const [_shapeType, shapeList] of this.shapes) {
      for (const shape of shapeList) {
        if (shape.status != status)
          continue;
        if (filter.h3r0 != shapeCache.UNDEFINED && !shape.filter.h3r0.includes(filter.h3r0))
          continue;
        if (filter.h3r1 != shapeCache.UNDEFINED && !shape.filter.h3r1.includes(filter.h3r1))
          continue;
        if (filter.h3r2 != shapeCache.UNDEFINED && !shape.filter.h3r2.includes(filter.h3r2))
          continue;
        if (filter.h3r3 != shapeCache.UNDEFINED && !shape.filter.h3r3.includes(filter.h3r3))
          continue;
        if (filter.h3r4 != shapeCache.UNDEFINED && !shape.filter.h3r4.includes(filter.h3r4))
          continue;
        if (filter.h3r5 != shapeCache.UNDEFINED && !shape.filter.h3r5.includes(filter.h3r5))
          continue;
        if (filter.h3r6 != shapeCache.UNDEFINED && !shape.filter.h3r6.includes(filter.h3r6))
          continue;
        if (filter.h3r7 != shapeCache.UNDEFINED && !shape.filter.h3r7.includes(filter.h3r7))
          continue;
        if (filter.h3r8 != shapeCache.UNDEFINED && !shape.filter.h3r8.includes(filter.h3r8))
          continue;
        if (filter.h3r9 != shapeCache.UNDEFINED && !shape.filter.h3r9.includes(filter.h3r9))
          continue;
        if (filter.h3r10 != shapeCache.UNDEFINED && !shape.filter.h3r10.includes(filter.h3r10))
          continue;
        if (filter.h3r11 != shapeCache.UNDEFINED && !shape.filter.h3r11.includes(filter.h3r11))
          continue;
        if (filter.h3r12 != shapeCache.UNDEFINED && !shape.filter.h3r12.includes(filter.h3r12))
          continue;
        if (filter.h3r13 != shapeCache.UNDEFINED && !shape.filter.h3r13.includes(filter.h3r13))
          continue;
        if (filter.h3r14 != shapeCache.UNDEFINED && !shape.filter.h3r14.includes(filter.h3r14))
          continue;
        if (filter.h3r15 != shapeCache.UNDEFINED && !shape.filter.h3r15.includes(filter.h3r15))
          continue;

        shapes.push(shape.shapeId);
      }
    }
  }

  private getFilterAtResolution(h3index: string, h3res: number, atRes: number) {
    var h3filter = shapeCache.UNDEFINED;
    if (h3res == atRes) {
      h3filter = h3index;
    } else if (h3res < atRes) {
      h3filter = h3.h3ToParent(h3index, atRes);
    }
    return h3filter;
  }
}
