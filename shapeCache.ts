import { ShapeType } from "./shapeTypes";
import { redisClient } from "./redisClient";

export class shapeCache {

  private readonly rec: redisClient;
  private readonly shapes = new Map();

  constructor(rc: redisClient) {
    this.rec = rc;
  }

  public async downloadAllShapeTypes() {
    await this.downloadShapeType(ShapeType.Limit);
    await this.downloadShapeType(ShapeType.NoGo);
    await this.downloadShapeType(ShapeType.Parking);
    await this.downloadShapeType(ShapeType.NoParking);
  }

  private async downloadShapeType(type: ShapeType) {
    var list = await this.rec.getShapeType(type);
    this.shapes.set(type, list);
  }
}
