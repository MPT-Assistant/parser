import axios from "axios";
import { load, CheerioAPI, Element } from "cheerio";
import moment from "moment";

import https from "node:https";

import {
    IReplacementDay,
    IReplacementGroup,
    IReplacementItem,
    IReplacementLesson,
    IScheduleDay,
    IScheduleSpecialty,
    ISpecialty,
    ISpecialtySite,
    ISpecialtySiteGroupLeaders,
    ITeacher,
    TWeek,
} from "../types";

interface IParserOptions {
  mptHost: string;
  reaHost: string;
}

const mptPages = {
    schedule: "/studentu/raspisanie-zanyatiy/",
    replacements: "/studentu/izmeneniya-v-raspisanii/",
    replacementsOnDay: "/rasp-management/print-replaces.php?date=",
    specialtiesSites: "/sites-otdels/",
} as const;

const reaPages = {
    teachers: "/ru/org/colleges/instrcol/Pages/portfolio.aspx"
} as const;

class Parser {
    private _mptHost: string;
    private _reaHost: string;

    constructor({ 
        mptHost = "https://mpt.ru",
        reaHost = "https://www.rea.ru"
    }: Partial<IParserOptions> = {}) {
        this._mptHost = mptHost;
        this._reaHost = reaHost;
    }

    public async getCurrentWeek(): Promise<TWeek> {
        const $ = await this._loadMptPage(mptPages.schedule);
        const parsedWeek = $("span.label").text().trim();
        if (/Знаменатель/i.test(parsedWeek)) {
            return "Знаменатель";
        } else if (/Числитель/i.test(parsedWeek)) {
            return "Числитель";
        } else {
            throw new Error("Unknown week");
        }
    }

    public async getSchedule(): Promise<IScheduleSpecialty[]> {
        const $ = await this._loadMptPage(mptPages.schedule);

        const specialtyList: IScheduleSpecialty[] = [];
        const schedule = $("div.tab-content:nth-child(6)");

        schedule.children(".tab-pane").each((index, element) => {
            const elem = $(element);

            const scheduleHeader = elem.find("h2:nth-child(1)").text().trim();
            const specialty: IScheduleSpecialty = {
                name: scheduleHeader.replace("Расписание занятий для ", ""),
                groups: [],
            };

            const specialtyGroups = elem.find(".tab-content").first();

            specialtyGroups.children().each((index, element) => {
                const elem = $(element);

                const groupsNames = this._fixNonDecodeString(
                    elem.find("h3").text().trim()
                ).replace("Группа ", "").split(", ").map(this._fixGroupName.bind(this));

                const groupWeekSchedule: IScheduleDay[] = [];

                const weekSchedule = elem.find("table");

                weekSchedule.each((index, element) => {
                    const elem = $(element);

                    const title = elem.find("h4");
                    const placeName = title.find("span").text().trim();
                    const dayName = title.text().replace(placeName, "").trim();

                    const daySchedule: IScheduleDay = {
                        num: this._getDayNum(dayName),
                        place: placeName.replace(/\(|\)/g, "") || "Отсутствует",
                        lessons: [],
                    };

                    const schedule = elem.find("tbody").children();
                    schedule.each((index, element) => {
                        if (index === 0) {
                            return;
                        }

                        const elem = $(element);
                        const lessonNum = Number(elem.find("td:nth-child(1)").text());

                        if (lessonNum === 0) {
                            return;
                        }

                        let lessonName: [string, string?];
                        let teacherName: [string, string?];

                        const lessonElement = elem.find("td:nth-child(2)");
                        const teacherElement = elem.find("td:nth-child(3)");

                        if (lessonElement.children().length === 0) {
                            lessonName = [lessonElement.text().trim() || "Отсутствует"];
                            teacherName = [teacherElement.text().trim() || "Отсутствует"];
                        } else {
                            lessonName = [
                                lessonElement.find("div:nth-child(1)").text().trim() || "-",
                                lessonElement.find("div:nth-child(3)").text().trim() || "-",
                            ];

                            teacherName = [
                                teacherElement.find("div:nth-child(1)").text().trim() || "-",
                                teacherElement.find("div:nth-child(3)").text().trim() || "-",
                            ];
                        }

                        daySchedule.lessons.push({
                            num: lessonNum,
                            name: lessonName,
                            teacher: teacherName,
                        });
                    });
                    groupWeekSchedule.push(daySchedule);
                });

                specialty.groups.push(
                    ...groupsNames.map((name) => {
                        return { name, days: groupWeekSchedule };
                    })
                );
            });

            specialtyList.push(specialty);
        });

        return specialtyList;
    }

    public async getReplacements(): Promise<IReplacementDay[]> {
        const $ = await this._loadMptPage(mptPages.replacements);

        const list = $(".container-fluid > div:nth-child(1) > div:nth-child(3)");
        const response: IReplacementDay[] = [];

        list.children().map((index, element) => {
            if (index === 0) {
                return;
            }

            const elem = $(element);

            if (elem[0].name === "h4") {
                const sourceDate = elem.text();
                const parsedDate = sourceDate.match(/((?:\d{2}).(?:\d{2}).(?:\d{4}))/g);
                if (parsedDate === null) {
                    throw new Error("Date not found");
                }
                const date = moment(parsedDate[0], "DD.MM.YYYY").toDate();
                response.push({
                    date,
                    groups: [],
                });
                return;
            }

            if (elem[0].name !== "div") {
                return;
            }

            const sourceGroupNames = elem.find(
                "table:nth-child(1) > caption:nth-child(1) > b:nth-child(1)"
            );
            const groupNames = sourceGroupNames.text().split(", ").map(
                this._fixGroupName.bind(this)
            );

            const replacements: IReplacementItem[] = [];

            const replacementsList = elem.find(
                "table:nth-child(1) > tbody:nth-child(2) > tr:not(:first-child)"
            );

            for (const element of replacementsList) {
                const elem = $(element);

                const sourceLessonNum = elem.find("td:nth-child(1)").text();
                const sourceOldLesson = elem.find("td:nth-child(2)").text();
                const sourceNewLesson = elem.find("td:nth-child(3)").text();
                const sourceAddToSite = elem.find("td:nth-child(4)").text();

                const [lessonNum, newLesson, oldLesson, addToSite]: [
                    number,
                    IReplacementLesson,
                    IReplacementLesson,
                    Date
                ] = [
                    parseInt(sourceLessonNum),
                    this._parseLesson(sourceNewLesson),
                    this._parseLesson(sourceOldLesson),
                    moment(sourceAddToSite, "DD.MM.YYYY HH:mm:ss").toDate(),
                ];

                replacements.push({
                    num: lessonNum,
                    new: newLesson,
                    old: oldLesson,
                    created: addToSite,
                });
            }

            groupNames.map((group) => {
                response[response.length - 1].groups.push({
                    group,
                    replacements,
                });
            });
        });

        return response;
    }

    public async getReplacementsOnDay(
        date: moment.MomentInput = new Date()
    ): Promise<IReplacementGroup[]> {
        const selectedDate = moment(date);
        selectedDate.set("milliseconds", 0);
        selectedDate.set("seconds", 0);
        selectedDate.set("minutes", 0);
        selectedDate.set("hours", 0);

        const $ = await this._loadMptPage(
            mptPages.replacementsOnDay + moment(date).format("YYYY-MM-DD")
        );

        const response: IReplacementGroup[] = [];
        const list = $("body").children();

        list.each((index, element) => {
            if (index === 0) {
                return;
            }
            const elem = $(element);
            const groupName = this._fixGroupName(elem.find("caption").text().trim());
            const replacementsList = elem.find("tbody");

            const replacements: IReplacementItem[] = [];

            replacementsList.children().each((index, element) => {
                if (index === 0) {
                    return;
                }
                const elem = $(element);
                const num = Number(elem.find("td:nth-child(1)").text().trim());

                const oldLessonString = elem.find("td:nth-child(2)").text().trim();
                const newLessonString = elem.find("td:nth-child(3)").text().trim();

                const oldLesson = this._parseLesson(oldLessonString);
                const newLesson = this._parseLesson(newLessonString);

                replacements.push({
                    new: newLesson,
                    old: oldLesson,
                    num,
                    created: selectedDate.toDate(),
                });
            });

            response.push(
                ...groupName.split(", ").map((group) => {
                    return { group, replacements };
                })
            );
        });

        return response;
    }

    public async *loadReplacements(
        minimalDate: moment.MomentInput,
        maximumDate: moment.MomentInput = new Date()
    ): AsyncGenerator<IReplacementGroup[], void, unknown> {
        const selectedDate = moment(minimalDate);
        selectedDate.isBefore(maximumDate);

        while (selectedDate.isBefore(maximumDate)) {
            yield await this.getReplacementsOnDay(selectedDate);
        }
    }

    public async getSpecialtiesList(): Promise<ISpecialty[]> {
        const $ = await this._loadMptPage(mptPages.specialtiesSites);
        const list = $(".container-fluid > div:nth-child(1) > div:nth-child(3)");
        const response: ISpecialty[] = [];
        list.children().map((index, element) => {
            const elem = $(element).find("a");
            const name = elem.text().trim();
            response.push({
                name,
                code: name.match(
                    /(\d\d\.\d\d\.\d\d(?:(?:\([А-Я]+\))?)|Отделение первого курса)/g
                )?.[0] as string,
                url: (elem.attr("href") as string).trim(),
            });
        });
        return response;
    }

    public async getSpecialtySite(
        specialty: string,
        specialtiesList?: ISpecialty[]
    ): Promise<ISpecialtySite> {
        if (!specialtiesList) {
            specialtiesList = await this.getSpecialtiesList();
        }

        const regexp = new RegExp(
            specialty.replace(/[-\\/\\^$*+?.()|[\]{}]/g, "\\$&"),
            "ig"
        );

        const specialtyInfo = specialtiesList.find((x) => regexp.test(x.name));

        if (!specialtyInfo) {
            throw new Error("Specialty not found");
        }

        const response: ISpecialtySite = {
            ...specialtyInfo,
            importantInformation: [],
            news: [],
            examQuestions: [],
            groupsLeaders: [],
        };

        const specialtySite = (await axios.get(specialtyInfo.url)).data as string;
        const $ = load(specialtySite);

        const importantInformation = $(
            "body > div.page > main > div > section:nth-child(3) > div > div > div.col-xs-12.col-sm-8 > div:nth-child(1) > ul"
        );
        importantInformation.children().map((index, element) => {
            const elem = $(element);
            const news = elem.find("a");
            const date = elem.find("div").text().trim();
            const name = news.text().trim();
            const link = (news.attr("href") as string).trim().substring(1);
            const url = link ? `https://mpt.ru/${link}` : "";
            response.importantInformation.push({
                name,
                url,
                date: moment(date, "DD.MM.YYYY").toDate(),
            });
        });

        const groupsLeadersList = $(
            "div.block_no-margin:contains(Активы групп)"
        ).find(".tab-content");

        groupsLeadersList.children().map((index, element) => {
            const elem = $(element);
            const name = elem.find("h3").text().trim();

            const groupInfo: ISpecialtySiteGroupLeaders = {
                name,
                roles: [],
            };

            elem.find("table").map((index, element) => {
                const elem = $(element);
                const [photo, role, name] = elem.find("tr").children();
                const photoSrc = $(photo).find("img").attr("src") as string;
                groupInfo.roles.push({
                    photo: photoSrc ? `https://mpt.ru/${photoSrc}` : "",
                    role: $(role).text().trim(),
                    name: $(name).text().trim(),
                });
            });

            if (groupInfo.roles.length > 0) {
                response.groupsLeaders.push(groupInfo);
            }
        });

        const news = $(".col-sm-8 > div:contains(Новости) > ul");
        news.children().map((index, element) => {
            const elem = $(element);
            const news = elem.find("a");
            const date = elem.find("div").text().trim();
            const name = news.text().trim();
            const link = (news.attr("href") as string).trim();
            const url = link ? `https://mpt.ru/${link}` : "";
            response.news.push({
                name,
                url,
                date: moment(date, "DD.MM.YYYY").toDate(),
            });
        });

        const examQuestions = $(".table-hover > tbody:nth-child(2)");
        examQuestions.children().map((index, element) => {
            const elem = $(element);
            const document = elem.find("a");
            const name = document.text().trim();
            const link = (document.attr("href") as string).trim();
            const url = link ? `https://mpt.ru/${link}` : "";
            const date = elem.find("td:nth-child(2)").text().trim();
            response.examQuestions.push({
                name,
                url,
                date: moment(date, "DD.MM.YYYY HH:mm:ss").toDate(),
            });
        });

        return response;
    }

    public async getTeachers(): Promise<ITeacher[]> {
        const $ = await this._loadReaPage(reaPages.teachers);

        const teachers: ITeacher[] = [];
        const list = $("td[class=max-content-weight] img");

        const isTeacherName = (name: string): boolean => {
            const length = name.split(" ").length;
            return length >= 3 && length <= 4;
        };

        const parseTeacher = (element: Element): void => {
            let teacherName = element.attribs.alt || "";

            if (!isTeacherName(teacherName)) {
                let currentElement = element.next;

                while (currentElement && !isTeacherName(teacherName)) {
                    teacherName = this._normalizeTeacherName($(currentElement).text().trim());
                    currentElement = currentElement.next;
                }

                if (!isTeacherName(teacherName)) {
                    if (element.parent === null) {
                        return;
                    }

                    const parent = $(element.parent).parent();
                    const parentText = this._normalizeTeacherName(parent.text().trim()).split("");

                    const middle = parentText.findIndex((value, index) => {
                        const nextLetter = parentText[index + 1];
                        if (!nextLetter) {
                            return undefined;
                        }
                        const upperRegExp = new RegExp("[А-Я]");
                        const lowerRegExp = new RegExp("[а-я]");

                        return lowerRegExp.test(value) && upperRegExp.test(nextLetter);
                    });

                    if (middle === -1) {
                        return;
                    }

                    teacherName = parentText.join("").slice(middle + 1);
                }

                if (!isTeacherName(teacherName)) {
                    return;
                }
            }
            
            const link = $(`a:contains(${teacherName})`).attr("href");

            teachers.push({
                ...this._parseTeacherName(teacherName),
                photo: element.attribs.src.startsWith("/") ? `${this._reaHost}${element.attribs.src}` : element.attribs.src,
                link: link ? `${this._reaHost}${link}` : undefined
            });
        };

        list.each((_index, element) => {
            return parseTeacher(element);
        });

        return teachers;
    }

    private _parseLesson(lessonString: string): IReplacementLesson {
        lessonString = lessonString.trim();
        const teachers = lessonString.match(/((?:[А-Я].){2} [А-Яа-я]*)/g);

        if (teachers) {
            return {
                name: lessonString
                    .replace(
                        teachers.length === 1 ? teachers[0] : teachers.join(", "),
                        ""
                    )
                    .trim(),
                teacher: teachers.join(", "),
            };
        } else {
            return { name: lessonString, teacher: "Отсутствует" };
        }
    }

    private _generateCookie(): string {
        const id = Math.random().toString(36).substring(2);
        return `PHPSESSID=MPT_Parser#${id};`;
    }

    private _fixNonDecodeString(input: string): string {
        try {
            return decodeURI(
                input.replace("_2C ", ", ").replace("_2F", "/").replace(/_/gi, "%")
            );
        } catch (error) {
            return input;
        }
    }

    // Symbols in the group code
    private _fixGroupName(group: string): string {
        // replacing the Russian o and English o with 0
        return group.replace(/о|o/gi, "0");
    }

    private _parseTeacherName(teacherName: string): Pick<ITeacher, "name" | "surname" | "patronymic"> {
        teacherName = this._normalizeTeacherName(teacherName);
        const [surname, name, ...patronymic] = teacherName.split(" ");

        return {
            name,
            surname,
            patronymic: patronymic.join(" ")
        };
    }

    private _normalizeTeacherName(name: string): string {
        return name.replace(new RegExp(String.fromCharCode(160), "g"), " ");
    }

    private _getDayNum(dayName: string): number {
        moment.locale("ru");
        const days = moment.weekdays().map((x) => new RegExp(x, "gi"));
        return days.findIndex((x) => x.test(dayName));
    }

    private async _loadMptPage(path: typeof mptPages[keyof typeof mptPages] | string): Promise<CheerioAPI> {
        const html = (
            await axios.get<string>(this._mptHost + path, {
                headers: {
                    // Bypassing an error bad request (occurs with a large number of requests from one IP)
                    cookie: this._generateCookie()
                },
                decompress: false
            })
        ).data;

        return load(html);
    }

    private async _loadReaPage(path: typeof reaPages[keyof typeof reaPages]): Promise<CheerioAPI> {
        const html = (
            await axios.get<string>(this._reaHost + path, {
                headers: {
                    Accept: "text/html",
                    // Bypassing an error bad request (occurs with a large number of requests from one IP)
                    cookie: this._generateCookie()
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            })
        ).data;

        return load(html);
    }
}

export default Parser;
