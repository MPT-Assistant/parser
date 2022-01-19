declare namespace MPT {
    export type TWeek = "Знаменатель" | "Числитель";

    namespace Schedule {
        export interface ILesson {
            num: number;
            name: [string, string?];
            teacher: [string, string?];
        }

        export interface IDay {
            num: number;
            place: string;
            lessons: ILesson[];
        }

        export interface IGroup {
            name: string;
            days: Day[];
        }

        export interface ISpecialty {
            name: string;
            groups: Group[];
        }
    }

    namespace Replacements {
        export interface ILesson {
            name: string;
            teacher: string;
        }

        export interface IReplacement {
            num: number;
            old: ILesson;
            new: ILesson;
            created: Date;
        }

        export interface IGroup {
            group: string;
            replacements: IReplacement[];
        }

        export interface IDay {
            date: Date;
            groups: IGroup[];
        }
    }

    namespace Specialties {
        export interface ISpecialty {
            name: string;
            code: string;
            url: string;
        }

        export interface ISiteGroupLeaders {
            name: string;
            roles: {
                photo: string;
                role: string;
                name: string;
            }[];
        }

        export interface ISiteItem {
            name: string;
            url: string;
            date: Date;
        }

        export interface ISite {
            name: string;
            code: string;
            url: string;
            importantInformation: SiteItem[];
            news: SiteItem[];
            examQuestions: SiteItem[];
            groupsLeaders: ISpecialtySiteGroupLeaders[];
        }
    }
}
