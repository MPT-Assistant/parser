declare namespace MPT {
    type TWeek = "Знаменатель" | "Числитель";

    namespace Schedule {
        interface ILesson {
            num: number;
            name: [string, string?];
            teacher: [string, string?];
        }

        interface IDay {
            num: number;
            place: string;
            lessons: ILesson[];
        }

        interface IGroup {
            name: string;
            days: Day[];
        }

        interface ISpecialty {
            name: string;
            groups: Group[];
        }
    }

    namespace Replacements {
        interface ILesson {
            name: string;
            teacher: string;
        }

        interface IRawReplacement {
            date: Date;
            num: number;
            old: ILesson;
            new: ILesson;
            created?: Date;
        }
    }
}
