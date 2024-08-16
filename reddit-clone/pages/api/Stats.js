import connectToDatabase from '../../db';

const selectedColumns = ['author', 'created_utc', 'score', 'id', 'subreddit', 'title', 'url'];

export default async function handler(req, res) {
    try {
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const subreddit = req.query.subreddit;
        const db = await connectToDatabase();

        console.log("Start Date: ", startDate)
        console.log("End Date: ", endDate)
        console.log("Subreddit: ", subreddit)
        res.status(200);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }

}