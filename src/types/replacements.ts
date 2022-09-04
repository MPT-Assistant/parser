export interface IReplacementLesson {
    name: string;
    teacher: string;
}

export interface IReplacementItem {
    num: number;
    old: IReplacementLesson;
    new: IReplacementLesson;
    created: Date;
}

export interface IReplacementGroup {
    group: string;
    replacements: IReplacementItem[];
}

export interface IReplacementDay {
    date: Date;
    groups: IReplacementGroup[];
}
