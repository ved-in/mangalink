const AdBlock = (() => {

	async function has_adblock() {
		try {
			return await AdBlockChecker.checkAdBlock();
		}
		catch {
			return true;
		}
	}

	function init(_opts = {}) {}
	return { init, has_adblock };

})();
