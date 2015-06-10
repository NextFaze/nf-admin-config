let assert = require('chai').assert,
    sinon = require('sinon');

import ReadQueries from "../../../lib/Queries/ReadQueries";
import PromisesResolver from "../../mock/PromisesResolver";
import Entity from "../../../lib/Entity/Entity";
import ReferenceField from "../../../lib/Field/ReferenceField";
import ReferencedListField from "../../../lib/Field/ReferencedListField";
import TextField from "../../../lib/Field/TextField";
import Field from "../../../lib/Field/Field";
import buildPromise from "../../mock/mixins";

describe('ReadQueries', () => {
    let readQueries,
        restWrapper = {},
        application = {},
        rawCats,
        rawHumans,
        catEntity,
        humanEntity,
        catView,
        humanView;

    beforeEach(() => {
        application = {
            getRouteFor: (entity, generatedUrl, viewType, id) => {
                let url = 'http://localhost/' + entity.name();
                if (id) {
                    url += '/' + id;
                }

                return url;
            }
        };

        readQueries = new ReadQueries(restWrapper, PromisesResolver, application);
        catEntity = new Entity('cat');
        humanEntity = new Entity('human');
        humanView = humanEntity.listView()
            .fields([
                new Field('name'),
                new ReferencedListField('cat_id').targetEntity(catEntity).targetReferenceField('human_id')
            ]);
        catView = catEntity.listView()
            .addField(new TextField('name'))
            .addField(new ReferenceField('human_id').targetEntity(humanEntity).targetField(new Field('firstName')));

        humanEntity.identifier(new Field('id'));

        rawCats = [
            {"id": 1, "human_id": 1, "name": "Mizoute", "summary": "A Cat"},
            {"id": 2, "human_id": 1, "name": "Suna", "summary": "A little Cat"}
        ];

        rawHumans = [
            {"id": 1, "firstName": "Daph"},
            {"id": 2, "firstName": "Manu"},
            {"id": 3, "firstName": "Daniel"}
        ];
    });

    describe("getOne", () => {

        it('should return the entity with all fields.', () => {
            let entity = new Entity('cat');
            entity.views['ListView']
                .addField(new TextField('name'));

            restWrapper.getOne = sinon.stub().returns(buildPromise({
                data: {
                    "id": 1,
                    "name": "Mizoute",
                    "summary": "A Cat"
                }
            }));

            readQueries.getOne(entity, 'list', 1)
                .then((rawEntry) => {
                    assert(restWrapper.getOne.calledWith('cat', 'http://localhost/cat/1'));

                    assert.equal(rawEntry.data.id, 1);
                    assert.equal(rawEntry.data.name, 'Mizoute');

                    // Non mapped field should also be retrieved
                    assert.equal(rawEntry.data.summary, "A Cat");
                });
        });

    });

    describe('getAll', () => {
        it('should return all data to display a ListView', () => {
            restWrapper.getList = sinon.stub().returns(buildPromise({data: rawCats, headers: () => {}}));
            PromisesResolver.allEvenFailed = sinon.stub().returns(buildPromise([
                {status: 'success', result: rawHumans[0] },
                {status: 'success', result: rawHumans[1] },
                {status: 'success', result: rawHumans[2] }
            ]));

            readQueries.getAll(catView)
                .then((result) => {
                    assert.equal(result.totalItems, 2);
                    assert.equal(result.data.length, 2);

                    assert.equal(result.data[0].id, 1);
                    assert.equal(result.data[0].name, 'Mizoute');

                    assert.equal(result.data[0].human_id, 1);
                });
        });

        it('should send correct page params to the API call', () => {
            let spy = sinon.spy(readQueries, 'getRawValues');

            readQueries.getAll(catView, 2);

            assert(spy.withArgs(catEntity, catView.name(), catView.type, 2).calledOnce);
        });

        it('should send correct sort params to the API call', () => {
            let spy = sinon.spy(readQueries, 'getRawValues');
            catView.sortField('name').sortDir('DESC');
            let viewName = catView.name();

            readQueries.getAll(catView, 1);
            readQueries.getAll(catView, 1, [], 'unknow_ListView.name', 'ASC');
            readQueries.getAll(catView, 1, [], viewName + '.id', 'ASC');

            assert(spy.withArgs(catEntity, viewName, catView.type, 1, catView.perPage(), undefined, catView.filters(), viewName + '.name', 'DESC').calledOnce);
            assert(spy.withArgs(catEntity, viewName, catView.type, 1, catView.perPage(), [], catView.filters(), viewName + '.name', 'DESC').calledOnce);
            assert(spy.withArgs(catEntity, viewName, catView.type, 1, catView.perPage(), [], catView.filters(), viewName + '.id', 'ASC').calledOnce);
        });
    });

    describe('getReferencedData', () => {
        it('should return all references data for a View with multiple calls', () => {
            let post = new Entity('posts'),
                author = new Entity('authors'),
                authorRef = new ReferenceField('author');

            let rawPosts = [
                {id: 1, author: 'abc'},
                {id: 2, author: '19DFE'}
            ];

            let rawAuthors = [
                {id: 'abc', name: 'Rollo'},
                {id: '19DFE', name: 'Ragna'}
            ];

            authorRef.targetEntity(author);
            authorRef.targetField(new Field('name'));
            post.views["ListView"]
                .addField(authorRef);

            restWrapper.getOne = sinon.stub().returns(buildPromise({}));
            PromisesResolver.allEvenFailed = sinon.stub().returns(buildPromise([
                {status: 'success', result: rawAuthors[0] },
                { status: 'success', result: rawAuthors[1] }
            ]));

            readQueries.getFilteredReferenceData(post.views["ListView"].getReferences(), rawPosts)
                .then((referencedData) => {
                    assert.equal(referencedData.author.length, 2);
                    assert.equal(referencedData.author[0].id, 'abc');
                    assert.equal(referencedData.author[1].name, 'Ragna');
                });
        });

        it('should return all references data for a View with one call', () => {
            let post = new Entity('posts'),
                author = new Entity('authors'),
                authorRef = new ReferenceField('author');

            authorRef.singleApiCall((ids) => {
                return {
                    id: ids
                };
            });

            let rawPosts = [
                {id: 1, author: 'abc'},
                {id: 2, author: '19DFE'}
            ];

            let rawAuthors = [
                {id: 'abc', name: 'Rollo'},
                {id: '19DFE', name: 'Ragna'}
            ];

            authorRef.targetEntity(author);
            authorRef.targetField(new Field('name'));
            post.views["ListView"]
                .addField(authorRef);

            restWrapper.getList = sinon.stub().returns(buildPromise({data: rawCats, headers: () => {}}));
            PromisesResolver.allEvenFailed = sinon.stub().returns(buildPromise([
                {status: 'success', result: { data: rawAuthors }}
            ]));

            readQueries.getOptimizedReferencedData(post.views["ListView"].getReferences(), rawPosts)
                .then((referencedData) => {
                    assert.equal(referencedData['author'].length, 2);
                    assert.equal(referencedData['author'][0].id, 'abc');
                    assert.equal(referencedData['author'][1].name, 'Ragna');
                });
        });
    });

     describe('getReferencedListData', () => {
        it('should return all referenced list data for a View', () => {
            restWrapper.getList = sinon.stub().returns(buildPromise({data: rawCats, headers: () => {}}));
            PromisesResolver.allEvenFailed = sinon.stub().returns(buildPromise([
                {status: 'success', result: { data: rawCats }}
            ]));

            readQueries.getReferencedListData(humanView.getReferencedLists(), null, null, 1)
                .then((referencedListEntries) => {
                    assert.equal(referencedListEntries['cat_id'].length, 2);
                    assert.equal(referencedListEntries['cat_id'][0].id, 1);
                    assert.equal(referencedListEntries['cat_id'][1].name, 'Suna');
                });
        });

        it('should send correct sort params to the API call', () => {
            let spy = sinon.spy(readQueries, 'getRawValues');
            humanView.getReferencedLists()['cat_id'].sortField('name').sortDir('DESC');
            let viewName = catView.name();
            let perPage = humanView.getReferencedLists()['cat_id'].perPage();
            let targetEntity = humanView.getReferencedLists()['cat_id'].targetEntity();

            readQueries.getReferencedListData(humanView.getReferencedLists(), null, null, 1);
            readQueries.getReferencedListData(humanView.getReferencedLists(), 'unknow_ListView.name', 'ASC', 1);
            readQueries.getReferencedListData(humanView.getReferencedLists(), 'cat_ListView.id', 'ASC', 1);

            assert(spy.withArgs(catEntity, viewName, 'listView', 1, perPage, { 'human_id': 1 }, {}, viewName + '.name', 'DESC').calledTwice);
            assert(spy.withArgs(targetEntity, viewName, 'listView', 1, perPage, { 'human_id': 1 }, {}, viewName + '.id', 'ASC').calledOnce);
        });
    });
});
