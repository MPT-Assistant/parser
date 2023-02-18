export type TWeek = "Знаменатель" | "Числитель";

export interface ITeacher {
    name: string;
    surname: string;
    patronymic: string;
    photo: string;
    link?: string;
}

export * from "./schedule";
export * from "./replacements";
export * from "./specialties";