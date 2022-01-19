declare namespace MPT {
    type TWeek = "Знаменатель" | "Числитель";

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
