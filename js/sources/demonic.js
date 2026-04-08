/*
I was overcomplicating this.
Instead of checking all the possible image urls WHICH THERE ARE MORE AND I WAS MISSING THEM

The images of the chapters all have `alt` attribute of similar pattern like:
"Martial Peak Chapter 3859 1"
"Possessing Me: The Untouchable Outsider Chapter 18 1"

which is of the pattern
`${manga.title} Chapter ${chapter.chapter} {page_no}`

Since I will not know which page_no exist, I can just check for the 1st image. Any scanlation will DEFINITELY have atleast one image xD

⣿⣿⣿⣿⣿⣿⣿⡿⠿⠛⢉⣡⢤⣤⣤⣤⣤⣄⣈⡉⠛⠿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⠟⠋⣀⣴⣮⠽⢾⣻⣞⣷⣟⣯⣿⠿⢿⠷⢦⣄⠙⠻⣿⣿⣿⣿⣿
⣿⣿⣿⡿⠃⢀⣼⡿⠿⠿⣿⣜⠻⣿⣼⣿⡿⣃⣿⡿⠿⢿⣜⢣⡄⠘⢿⣿⣿⣿
⣿⣿⠏⢀⠆⣽⡏⠀⠀⠊⠹⣿⡄⣿⣿⣿⢡⣿⡏⠀⠀⠂⢉⡧⢻ ⣦⡀⠻⣿⣿
⣿⠏⢀⢣⢂⠹⣿⣤⣀⣴⣿⡟⡔⣿⣿⣿⢐⣿⣿⣤⣀⣤⣾⢓⣸⣿⣷⡄⠹⣿
⡏⠠⡍⢆⠣⢆⡑⢋⠟⣭⠓⠈⣴⣿⣿⣿⣧⡨⢝⡛⠿⣙⢆⣵⣿⣿⣿⣳⡀⢹
⠀⡜⡸⢌⠳⢌⠶⣉⢚⣀⢼⡺⣯⣟⣿⣿⣿⣿⣦⣌⣛⡻⠿⢿⣿⡿⣯⢿⡅⠀
⠠⣑⠣⡜⡰⡘⢤⠛⣜⡹⣎⡷⣏⣿⢯⣿⣻⣿⣿⣿⣿⣷⣶⣾⣿⣳⢿⡾⣱⠀
⠐⣨⠑⢦⡑⢍⠲⣩⠒⡵⢣⡻⣜⣳⢟⡾⣯⣟⡿⣯⢿⡿⣽⣻⣳⢯⣛⡾⡅⠂
⡄⠰⣉⠦⣉⢎⡱⢂⡛⢬⢣⡝⢮⡝⣾⡹⢾⡭⢿⡽⣯⢟⡷⣫⡽⣞⢽⡚⠁⢰
⣷⡄⠘⠴⡡⢎⡰⢩⠜⡡⢖⡹⢦⡹⢲⡝⢧⡻⣝⢾⡱⢯⡞⡵⣹⢜⡲⠁⢬⣾
⣿⣿⣦⠈⠑⢪⡔⢣⡎⢱⠊⣴⢣⡜⢣⠚⣥⢳⡍⣮⠙⣧⠚⣵⢣⡎⠁⣴⣿⣿
⣿⣿⣿⣷⣔⠈⠰⢣⠘⢦⡙⠀⣤⣶⣦⠀⢰⡆⠘⢌⡳⢌⠳⠂⠁⣠⣾⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣶⣤⣌⣀⠡⠀⠀⠂⠈⠐⠀⢀⠂⠈⢄⣂⣤⣷⣿⣿⣿⣿⣿⣿
*/

const DEMONICSCANS = {
	name: "Demonic Scans",
	icon: "😈",
	type: "fantl",
	check_type: "html_alt",
	// check_type tells the proxy HOW to verify this source.
	// "html_alt" = fetch the chapter_url page HTML and look for the alt text pattern.

	_to_web_slug(title)
	{
		return title
			.trim()
			.replace(/-/g, "%25252D")
			.replace(/:/g, "%253A")
			.replace(/\s+/g, "-")
			.replace(/[^a-zA-Z0-9\-%]/g, "");
	},

	// Returns the expected alt text of the first chapter image, e.g.:
	//   "Martial Peak Chapter 3859 1" 								-> chapter 3859 pg 1 of the series "Martial Peak Chapter" 
	//   "Possessing Me: The Untouchable Outsider Chapter 18 1" 	-> chapter 18 pg 1 of the series "Possessing Me: The Untouchable Outsider"
	get_alt_text(manga, chapter)
	{
		return `${manga.title} Chapter ${chapter.chapter} 1`;
	},

	series_url(manga)
	{
		return `https://demonicscans.org/manga/${this._to_web_slug(manga.title)}`;
	},

	chapter_url(manga, chapter)
	{
		const slug = this._to_web_slug(manga.title);
		if (!chapter.chapter) return this.series_url(manga);
		return `https://demonicscans.org/title/${slug}/chapter/${chapter.chapter}/1`;
	},
};