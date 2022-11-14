import inquirer from 'inquirer'

const categories = [ 'Merge PRs', 'Report TS', 'Report unit test metrics' ]

const getOrganizations = async () => []

const mergePRs = async () => {
	const organizations = await getOrganizations()

	inquirer
		.prompt([
			{ type: 'list',
				name: 'Organization',
				choices: organizations },
		])
		.then(answers => {
			console.warn(answers)
			// Use user feedback for... whatever!!
		})
}

const index = function () {

	inquirer
		.prompt([
			{ type: 'list',
				name: 'Category',
				choices: categories },
		])
		.then(({ Category }) => {

			switch (Category) {
				case categories[0]:
					return mergePRs()
			}



			// Use user feedback for... whatever!!
		})
		.catch(error => {
			if (error.isTtyError)
				console.warn('Seems we can\'t render CLI here!')
			// Prompt couldn't be rendered in the current environment
			else
				console.warn('Something went wrong!', { error })
			// Something else went wrong
		})


	return
}

export default index
