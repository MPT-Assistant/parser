import axios from "axios";
import cheerio, { CheerioAPI } from "cheerio";

interface IParserOptions {
    host: string;
}

class Parser {
    private _host: string;

    constructor({ host = "https://mpt.ru" }: Partial<IParserOptions> = {}) {
        this._host = host;
    }

    public async getCurrentWeek(): Promise<MPT.TWeek> {
        const $ = await this._loadPage("/studentu/raspisanie-zanyatiy/");
        const parsedWeek = $("span.label").text().trim();
        if (/Знаменатель/i.test(parsedWeek)) {
            return "Знаменатель";
        } else if (/Числитель/i.test(parsedWeek)) {
            return "Числитель";
        } else {
            throw new Error("Unknown week");
        }
    }

    private _generateCookie(): string {
        const id = Math.random().toString(36).substring(2);
        return `PHPSESSID=MPT_Parser#${id};`;
    }

    private async _loadPage(path: string): Promise<CheerioAPI> {
        const html = (
            await axios.get(this._host + path, {
                headers: {
                    cookie: this._generateCookie(), // Bypassing an error bad request (occurs with a large number of requests from one IP)
                },
            })
        ).data as string;

        return cheerio.load(html);
    }
}

export default Parser;
