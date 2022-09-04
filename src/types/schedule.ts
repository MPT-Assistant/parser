export interface IScheduleLesson {
    num: number;
    name: [string, string?];
    teacher: [string, string?];
}

export interface IScheduleDay {
    num: number;
    place: string;
    lessons: IScheduleLesson[];
}

export interface IScheduleGroup {
    name: string;
    days: IScheduleDay[];
}

export interface IScheduleSpecialty {
    name: string;
    groups: IScheduleGroup[];
}
