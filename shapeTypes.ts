
export type shapeObject = {
    bucketName: string;
    objectKey: string;
};

export type fileList = {
    activeFiles: string[];
    inactiveFiles: string[];
    deletedFiles: string[];
    shapeType: string;
};

export type fileDiffList = {
    activeToCreate: string[];
    activeToKeep: string[];
    activeToInactivate: string[];
    activeToDelete: string[];
    activeToRemove: string[];
    inactiveToCreate: string[];
    inactiveToKeep: string[];
    inactiveToActivate: string[];
    inactiveToDelete: string[];
    inactiveToRemove: string[];
    deletedToCreate: string[];
    deletedToKeep: string[];
    deletedToRemove: string[];
};

export interface H3Resolutions {
    h3r0: string[],
    h3r1: string[],
    h3r2: string[],
    h3r3: string[],
    h3r4: string[],
    h3r5: string[],
    h3r6: string[],
    h3r7: string[],
    h3r8: string[],
    h3r9: string[],
    h3r10: string[],
    h3r11: string[],
    h3r12: string[],
    h3r13: string[],
    h3r14: string[],
    h3r15: string[]
}

export interface BaseShape {
    shapeId: string,
    name: string,
    status: string,
    type: string
}

export interface Shape extends BaseShape {
    createdAt: string,
    modifiedAt: string,
    deletedAt: string,
    shapeVersion: string,
    schemaVersion: string,
    polygon: [[number, number]],
    filter: H3Resolutions,
    shape: H3Resolutions
}

export interface BaseShapeKvp {id: string, value: BaseShape};
export interface BaseShapeArray extends Array<BaseShapeKvp> { };

export interface PolygonShape extends BaseShape {
    polygon: number[][]
}

export interface PolygonShapeKvp {id: string, value: PolygonShape};
export interface PolygonShapeArray extends Array<PolygonShapeKvp> { };

export interface H3PolygonShape extends BaseShape {
    h3polygon: number[][]
}

export interface H3PolygonShapeKvp {id: string, value: H3PolygonShape};
export interface H3PolygonShapeArray extends Array<H3PolygonShapeKvp> { };


export const enum ShapeType {
    Parking="PARKING",
    NoParking="NOPARKING",
    Limit="LIMIT",
    NoGo="NOGO"
};

export const enum ShapeStatus {
    Active="ACTIVE",
    Inactive="INACTIVE",
    Deleted="DELETED"
};
