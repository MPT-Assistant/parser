export interface ISpecialty {
    name: string;
    code: string;
    url: string;
}

export interface ISpecialtySiteGroupLeaders {
    name: string;
    roles: {
        photo: string;
        role: string;
        name: string;
    }[];
}

export interface ISpecialtySiteItem {
    name: string;
    url: string;
    date: Date;
}

export interface ISpecialtySite {
    name: string;
    code: string;
    url: string;
    importantInformation: ISpecialtySiteItem[];
    news: ISpecialtySiteItem[];
    examQuestions: ISpecialtySiteItem[];
    groupsLeaders: ISpecialtySiteGroupLeaders[];
}
